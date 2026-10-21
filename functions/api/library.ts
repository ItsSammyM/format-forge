import { createAuth, ensureAuthSchema } from '../../src/lib/auth-server';
import type { AuthEnv } from '../../src/lib/auth-server';
import { compactLibraryData } from '../../src/lib/library-data';
import { d1BlobBytes } from '../../src/lib/d1-bytes';

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}
type Env = Omit<AuthEnv, 'DB'> & { DB: D1Database };
interface Context { request: Request; env: Env }

const MAX_LIBRARY_BYTES = 32 * 1024 * 1024;
const CHUNK_BYTES = 512 * 1024;

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readLimitedText(request: Request, limit: number) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RangeError('request body exceeds limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

function splitBytes(bytes: Uint8Array) {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
    chunks.push(bytes.slice(offset, Math.min(offset + CHUNK_BYTES, bytes.byteLength)));
  }
  return chunks.length ? chunks : [new Uint8Array()];
}

function joinBytes(chunks: Uint8Array[]) {
  const bytes = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function gzip(text: string) {
  const compressedStream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(compressedStream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const decompressedStream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(decompressedStream).text();
}

async function getUserId(request: Request, auth: ReturnType<typeof createAuth>) {
  const result = await auth.api.getSession({ headers: request.headers });
  return result?.user?.id ?? null;
}

export async function onRequest({ request, env }: Context) {
  if (request.method !== 'GET' && request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);
  let userId: string | null;
  try {
    const auth = createAuth(env);
    await ensureAuthSchema(auth, env.DB as object);
    userId = await getUserId(request, auth);
  } catch {
    return json({ error: 'We couldn’t verify your sign-in. Please sign out and sign in again.' }, 503);
  }
  if (!userId) return json({ error: 'Please sign in to access your library.' }, 401);

  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT payload FROM library_chunks WHERE user_id = ? ORDER BY chunk_index')
        .bind(userId).all<{ payload: ArrayBuffer | ArrayBufferView | number[] }>();
      if (!results.length) return json({ library: null });
      const chunks = results.map(row => d1BlobBytes(row.payload));
      const compressedSize = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
      if (compressedSize > MAX_LIBRARY_BYTES + 1024 * 1024) return json({ error: 'Your saved library is too large to open.' }, 413);
      const compressed = joinBytes(chunks);
      const serialized = await gunzip(compressed);
      if (new TextEncoder().encode(serialized).byteLength > MAX_LIBRARY_BYTES) return json({ error: 'Your saved library is too large to open.' }, 413);
      return json({ library: JSON.parse(serialized) });
    } catch {
      return json({ error: 'We couldn’t load your saved library. Please try again. Your saved data hasn’t been changed.' }, 503);
    }
  }

  const declaredSize = Number(request.headers.get('Content-Length') ?? 0);
  if (declaredSize > MAX_LIBRARY_BYTES + 1024) return json({ error: 'Your library is too large to sync. Export a backup and remove some saved data before trying again.' }, 413);
  try {
    const rawBody = await readLimitedText(request, MAX_LIBRARY_BYTES + 1024);
    const input = JSON.parse(rawBody) as { library?: unknown };
    if (!input.library || typeof input.library !== 'object' || Array.isArray(input.library)) return json({ error: 'Your library could not be read. Please export a backup and try again.' }, 400);
    const library = input.library as { version?: unknown; decks?: unknown; formats?: unknown };
    if (library.version !== 1 || !Array.isArray(library.decks) || !Array.isArray(library.formats)) return json({ error: 'Your library could not be read. Please export a backup and try again.' }, 400);
    const compact = compactLibraryData(library as Parameters<typeof compactLibraryData>[0]);
    const serialized = JSON.stringify(compact);
    if (new TextEncoder().encode(serialized).byteLength > MAX_LIBRARY_BYTES) return json({ error: 'Your library is too large to sync. Export a backup and remove some saved data before trying again.' }, 413);
    const compressed = await gzip(serialized);
    const chunks = splitBytes(compressed);
    const updatedAt = new Date().toISOString();
    const statements = [env.DB.prepare('DELETE FROM library_chunks WHERE user_id = ?').bind(userId)];
    for (let index = 0; index < chunks.length; index++) {
      statements.push(env.DB.prepare('INSERT INTO library_chunks (user_id, chunk_index, payload) VALUES (?, ?, ?)')
        .bind(userId, index, chunks[index]));
    }
    await env.DB.batch(statements);
    return json({ saved: true, bytes: compressed.byteLength, updatedAt });
  } catch (error) {
    if (error instanceof RangeError) return json({ error: 'Your library is too large to sync. Export a backup and remove some saved data before trying again.' }, 413);
    if (error instanceof SyntaxError) return json({ error: 'Your library could not be read. Please export a backup and try again.' }, 400);
    return json({ error: 'We couldn’t save your changes. Check your connection and try again.' }, 503);
  }
}
