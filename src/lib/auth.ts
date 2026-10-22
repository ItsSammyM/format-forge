import { createAuthClient } from 'better-auth/svelte';
import { compactLibraryData } from './library-data';
import { parseLibraryWithDefaults } from './library-restore';
import type { Library } from './model';

export const authClient = createAuthClient();
export const authConfigured = import.meta.env.VITE_AUTH_ENABLED === 'true';

export type AuthSession = {
  user: { id: string; name: string; email: string; image?: string | null };
  session: { id: string; expiresAt: Date | string };
};
export type AuthStart = { configured: boolean; session?: AuthSession };

export async function startAuth(): Promise<AuthStart> {
  if (!authConfigured) return { configured: false };
  const result = await authClient.getSession();
  if (result.error) throw new Error('We couldn’t check your sign-in. Please try again.');
  return { configured: true, session: result.data ?? undefined };
}

export async function loginWithDiscord() {
  const result = await authClient.signIn.social({
    provider: 'discord',
    callbackURL: window.location.href,
  });
  if (result.error) throw new Error('We couldn’t start sign-in. Please try again.');
}

export async function logout() {
  const result = await authClient.signOut();
  if (result.error) throw new Error('We couldn’t sign you out. Please try again.');
  window.location.reload();
}

export async function deleteAccount() {
  const result = await authClient.deleteUser();
  if (result.error) throw new Error('We couldn’t delete your account. Sign out and back in, then try again.');
}

const COMPRESSED_LIBRARY_TYPE = 'application/vnd.format-forge.library+gzip';
const RECORDS_TYPE = 'application/vnd.format-forge.records+json';
type RecordType = 'deck' | 'format' | 'preferences';
type AccountRecord = { type: RecordType; id: string; payload: string };
type AccountRecordSnapshot = AccountRecord & { bytes: number; source: unknown };
type StoredAccountRecord = { type: RecordType; id: string; payloadChunks: string[] };
let accountRecordBaseline = new Map<string, AccountRecordSnapshot>();
let accountRecordsInitialized = false;

function recordKey(type: RecordType, id: string) { return `${type}\u0000${id}`; }

function samePreferenceSources(a: unknown, b: unknown) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function recordsFromLibrary(library: Library, previous = new Map<string, AccountRecordSnapshot>()) {
  const compact = compactLibraryData(library);
  const records = new Map<string, AccountRecordSnapshot>();
  const encoder = new TextEncoder();
  const add = (type: RecordType, id: string, value: unknown, source: unknown) => {
    const key = recordKey(type, id);
    const prior = previous.get(key);
    const unchanged = type === 'preferences'
      ? prior && samePreferenceSources(prior.source, source)
      : prior?.source === source;
    const serialized = unchanged && prior ? undefined : JSON.stringify(value);
    const payload = unchanged && prior ? prior.payload : serialized ?? 'null';
    const bytes = unchanged && prior ? prior.bytes : encoder.encode(payload).byteLength;
    records.set(key, { type, id, payload, bytes, source });
  };
  for (const deck of compact.decks) add('deck', deck.id, deck, deck);
  for (const format of compact.formats) add('format', format.id, format, format);
  const preferences = {
    ...(compact.preferredView ? { preferredView: compact.preferredView } : {}),
    ...(compact.preferredPrintings ? { preferredPrintings: compact.preferredPrintings } : {}),
    ...(compact.theme === 'light' ? { theme: compact.theme } : {}),
    ...(compact.accentColor ? { accentColor: compact.accentColor } : {}),
  };
  if (Object.keys(preferences).length) {
    add('preferences', 'account', preferences, [compact.preferredView, compact.preferredPrintings, compact.theme, compact.accentColor]);
  }
  return records;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function compressRecord(value: string) {
  const buffer = await new Response(new Blob([value]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

async function decompressRecord(value: string) {
  const bytes = base64ToBytes(value);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as unknown;
}

async function sendRecordPatch(upserts: AccountRecord[], deletes: Array<{ type: RecordType; id: string }>, completeMigration: boolean, resetRecords = false) {
  const response = await fetch('/api/library/records', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': RECORDS_TYPE },
    body: JSON.stringify({ upserts, deletes, completeMigration, resetRecords }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? 'Your account library is unavailable. Please try again.');
  }
}

async function syncAccountRecords(library: Library, previous: Map<string, AccountRecordSnapshot>, migrate = false) {
  const next = recordsFromLibrary(library, previous);
  let libraryBytes = 0;
  for (const record of next.values()) libraryBytes += record.bytes;
  if (libraryBytes > 32 * 1024 * 1024) {
    throw new Error('Your library is too large to sync. Export a backup and remove some saved data before trying again.');
  }
  const upserts: AccountRecord[] = [];
  const deletes: Array<{ type: RecordType; id: string }> = [];
  for (const [key, record] of next) {
    if (previous.get(key)?.payload === record.payload) continue;
    upserts.push({ type: record.type, id: record.id, payload: await compressRecord(record.payload) });
  }
  for (const key of previous.keys()) {
    if (!next.has(key)) {
      const [type, id] = key.split('\u0000');
      deletes.push({ type: type as RecordType, id });
    }
  }

  if (migrate) {
    const batches: Array<{ upserts: AccountRecord[]; deletes: Array<{ type: RecordType; id: string }> }> = [];
    let batch = { upserts: [] as AccountRecord[], deletes: [] as Array<{ type: RecordType; id: string }> };
    let batchBytes = 0;
    const flush = () => {
      if (batch.upserts.length || batch.deletes.length) batches.push(batch);
      batch = { upserts: [], deletes: [] };
      batchBytes = 0;
    };
    for (const item of upserts) {
      const bytes = item.payload.length + item.id.length + 64;
      if (batchBytes + bytes > 512 * 1024 || batch.upserts.length + batch.deletes.length >= 40) flush();
      batch.upserts.push(item);
      batchBytes += bytes;
    }
    for (const item of deletes) {
      if (batchBytes + item.id.length + 64 > 512 * 1024 || batch.upserts.length + batch.deletes.length >= 40) flush();
      batch.deletes.push(item);
      batchBytes += item.id.length + 64;
    }
    if (!batches.length || batch.upserts.length || batch.deletes.length) batches.push(batch);
    for (let index = 0; index < batches.length; index++) {
      const current = batches[index];
      await sendRecordPatch(current.upserts, current.deletes, index === batches.length - 1, index === 0);
    }
  } else if (upserts.length || deletes.length) {
    await sendRecordPatch(upserts, deletes, false);
  }
  accountRecordBaseline = new Map(next);
  if (migrate) accountRecordsInitialized = true;
}

async function libraryRequest(method: 'DELETE') {
  const response = await fetch('/api/library', {
    method,
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? 'Your account library is unavailable. Please try again.');
  }
  return response.json() as Promise<{ deleted: boolean }>;
}

export async function loadAccountLibrary(_session: AuthSession): Promise<Library | null> {
  const response = await fetch('/api/library/records', {
    method: 'GET', credentials: 'same-origin', headers: { Accept: RECORDS_TYPE },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? 'Your account library is unavailable. Please try again.');
  }
  if (response.headers.get('Content-Type')?.startsWith(COMPRESSED_LIBRARY_TYPE)) {
    if (!response.body) throw new Error('We couldn’t read your saved library. Your copy on this device is unchanged.');
    const text = await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
    const migratedLibrary = parseLibraryWithDefaults(text);
    await syncAccountRecords(migratedLibrary, new Map(), true);
    return migratedLibrary;
  }
  const responseData = await response.json() as {
    initialized?: boolean;
    records?: StoredAccountRecord[];
    library?: unknown | null;
  };
  if (!Array.isArray(responseData.records)) {
    if (responseData.library === null) {
      accountRecordBaseline = new Map();
      accountRecordsInitialized = false;
      return null;
    }
    if (!responseData.library || typeof responseData.library !== 'object') throw new Error('We couldn’t read your saved library. Your copy on this device is unchanged.');
    const migratedLibrary = parseLibraryWithDefaults(JSON.stringify(responseData.library));
    await syncAccountRecords(migratedLibrary, new Map(), true);
    return migratedLibrary;
  }
  if (!responseData.initialized) {
    accountRecordBaseline = new Map();
    accountRecordsInitialized = false;
    return null;
  }
  const values = new Map<string, unknown>();
  for (const record of responseData.records) {
    if (!record || !['deck', 'format', 'preferences'].includes(record.type) || typeof record.id !== 'string' || !Array.isArray(record.payloadChunks) || record.payloadChunks.some(chunk => typeof chunk !== 'string')) {
      throw new Error('We couldn’t read your saved library. Your copy on this device is unchanged.');
    }
    const value = await decompressRecord(record.payloadChunks.join(''));
    values.set(recordKey(record.type, record.id), value);
  }
  const preferences = values.get(recordKey('preferences', 'account')) as Record<string, unknown> | undefined;
  const libraryData = {
    ...(preferences ?? {}), version: 1,
    decks: [...values.entries()].filter(([key]) => key.startsWith('deck\u0000')).map(([, value]) => value),
    formats: [...values.entries()].filter(([key]) => key.startsWith('format\u0000')).map(([, value]) => value),
  };
  const library = parseLibraryWithDefaults(JSON.stringify(libraryData));
  accountRecordBaseline = recordsFromLibrary(library);
  accountRecordsInitialized = true;
  return library;
}

/** Rebind the baseline to Svelte's reactive proxies after assigning a loaded library. */
export function markAccountLibraryLoaded(library: Library) {
  accountRecordBaseline = recordsFromLibrary(library, accountRecordBaseline);
}

export async function saveAccountLibrary(_session: AuthSession, library: Library): Promise<void> {
  await syncAccountRecords(library, accountRecordBaseline, !accountRecordsInitialized);
}

export async function clearAccountLibrary(_session: AuthSession): Promise<void> {
  await libraryRequest('DELETE');
  accountRecordBaseline = new Map();
  accountRecordsInitialized = false;
}
