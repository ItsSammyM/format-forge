import { createAuth, ensureAuthSchema } from '../../../src/lib/auth-server';
import type { AuthEnv } from '../../../src/lib/auth-server';
import { d1BlobBytes } from '../../../src/lib/d1-bytes';

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

const MAX_PATCH_BYTES = 4 * 1024 * 1024;
const MAX_RECORD_BYTES = 3 * 1024 * 1024;
const CHUNK_BYTES = 512 * 1024;
const RECORDS_TYPE = 'application/vnd.format-forge.records+json';
const LEGACY_TYPE = 'application/vnd.format-forge.library+gzip';
const RECORD_TYPES = new Set(['deck', 'format', 'preferences']);
const STATE_TYPE = 'state';
const STATE_ID = 'migration';

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
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function gzipChunkStream(values: Uint8Array[]) {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= values.length) controller.close();
      else controller.enqueue(values[index++]);
    },
  });
}

async function getUserId(request: Request, auth: ReturnType<typeof createAuth>) {
  const result = await auth.api.getSession({ headers: request.headers });
  return result?.user?.id ?? null;
}

function groupRows(rows: Array<{ record_type: string; record_id: string; chunk_index: number; payload: string }>) {
  const groups: Array<{ record_type: string; record_id: string; payloadChunks: string[] }> = [];
  for (const row of rows) {
    let group = groups[groups.length - 1];
    if (!group || group.record_type !== row.record_type || group.record_id !== row.record_id) {
      group = { record_type: row.record_type, record_id: row.record_id, payloadChunks: [] };
      groups.push(group);
    }
    group.payloadChunks[row.chunk_index] = row.payload;
  }
  return groups;
}

function recordsResponse(rows: Array<{ record_type: string; record_id: string; payloadChunks: string[] }>, initialized: boolean) {
  const encoder = new TextEncoder();
  let index = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === 0) controller.enqueue(encoder.encode(`{"initialized":${initialized},"records":[`));
      if (index < rows.length) {
        const row = rows[index++];
        const prefix = index > 1 ? ',' : '';
        const header = JSON.stringify({ type: row.record_type, id: row.record_id });
        controller.enqueue(encoder.encode(`${prefix}${header.slice(0, -1)},"payloadChunks":${JSON.stringify(row.payloadChunks)}}`));
      } else if (index === rows.length) {
        index++;
        controller.enqueue(encoder.encode(']}'));
      } else controller.close();
    },
  });
  return new Response(stream, { headers: { 'Cache-Control': 'no-store', 'Content-Type': RECORDS_TYPE } });
}

async function readLegacyLibrary(db: D1Database, userId: string) {
  const { results } = await db.prepare('SELECT payload FROM library_chunks WHERE user_id = ? ORDER BY chunk_index')
    .bind(userId).all<{ payload: ArrayBuffer | ArrayBufferView | number[] }>();
  return results.map(row => d1BlobBytes(row.payload));
}

export async function onRequest({ request, env }: Context) {
  if (request.method !== 'GET' && request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);
  let userId: string | null;
  try {
    const auth = createAuth(env);
    await ensureAuthSchema(auth, env.DB as object);
    userId = await getUserId(request, auth);
  } catch (error) {
    console.error('[api/library/records] Failed to initialize auth or verify the session.', error);
    return json({ error: 'We couldn’t verify your sign-in. Please sign out and sign in again.' }, 503);
  }
  if (!userId) return json({ error: 'Please sign in to access your library.' }, 401);

  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT record_type, record_id, chunk_index, payload FROM library_records WHERE user_id = ? ORDER BY record_type, record_id, chunk_index')
        .bind(userId).all<{ record_type: string; record_id: string; chunk_index: number; payload: string }>();
      const initialized = results.some(row => row.record_type === STATE_TYPE && row.record_id === STATE_ID);
      if (initialized) return recordsResponse(groupRows(results.filter(row => row.record_type !== STATE_TYPE)), true);

      const legacyChunks = await readLegacyLibrary(env.DB, userId);
      if (legacyChunks.length) {
        return new Response(gzipChunkStream(legacyChunks), {
          headers: { 'Cache-Control': 'no-store', 'Content-Type': LEGACY_TYPE },
        });
      }
      return json({ library: null });
    } catch (error) {
      console.error('[api/library/records] Failed to load account records.', error);
      return json({ error: 'We couldn’t load your saved library. Please try again. Your saved data hasn’t been changed.' }, 503);
    }
  }

  try {
    const raw = await readLimitedText(request, MAX_PATCH_BYTES);
    const patch = JSON.parse(raw) as {
      upserts?: Array<{ type?: unknown; id?: unknown; payload?: unknown }>;
      deletes?: Array<{ type?: unknown; id?: unknown }>;
      completeMigration?: boolean;
      resetRecords?: boolean;
    };
    if (!Array.isArray(patch.upserts) || !Array.isArray(patch.deletes) || typeof patch.completeMigration !== 'boolean' || typeof patch.resetRecords !== 'boolean') {
      return json({ error: 'Your library changes could not be read. Please try again.' }, 400);
    }

    const statements: D1PreparedStatement[] = [];
    if (patch.resetRecords) statements.push(env.DB.prepare('DELETE FROM library_records WHERE user_id = ?').bind(userId));
    for (const record of patch.upserts) {
      if (!record || typeof record.type !== 'string' || !RECORD_TYPES.has(record.type)
        || typeof record.id !== 'string' || !record.id || typeof record.payload !== 'string'
        || record.payload.length === 0
        || record.payload.length > MAX_RECORD_BYTES || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(record.payload)) {
        return json({ error: 'Your library changes could not be read. Please try again.' }, 400);
      }
      statements.push(env.DB.prepare('DELETE FROM library_records WHERE user_id = ? AND record_type = ? AND record_id = ?')
        .bind(userId, record.type, record.id));
      const chunks = Array.from({ length: Math.ceil(record.payload.length / CHUNK_BYTES) }, (_, index) => record.payload.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES));
      for (let index = 0; index < chunks.length; index++) {
        statements.push(env.DB.prepare('INSERT INTO library_records (user_id, record_type, record_id, chunk_index, payload) VALUES (?, ?, ?, ?, ?)')
          .bind(userId, record.type, record.id, index, chunks[index]));
      }
    }
    for (const record of patch.deletes) {
      if (!record || typeof record.type !== 'string' || !RECORD_TYPES.has(record.type)
        || typeof record.id !== 'string' || !record.id) {
        return json({ error: 'Your library changes could not be read. Please try again.' }, 400);
      }
      statements.push(env.DB.prepare('DELETE FROM library_records WHERE user_id = ? AND record_type = ? AND record_id = ?')
        .bind(userId, record.type, record.id));
    }
    if (patch.completeMigration) {
      statements.push(env.DB.prepare('INSERT INTO library_records (user_id, record_type, record_id, chunk_index, payload) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, record_type, record_id, chunk_index) DO UPDATE SET payload = excluded.payload')
        .bind(userId, STATE_TYPE, STATE_ID, 0, '1'));
      statements.push(env.DB.prepare('DELETE FROM library_chunks WHERE user_id = ?').bind(userId));
    }
    if (statements.length) await env.DB.batch(statements);
    return json({ saved: true });
  } catch (error) {
    if (error instanceof RangeError) return json({ error: 'Your library changes are too large to sync. Please try again.' }, 413);
    if (error instanceof SyntaxError) return json({ error: 'Your library changes could not be read. Please try again.' }, 400);
    console.error('[api/library/records] Failed to save account records.', error);
    return json({ error: 'We couldn’t save your changes. Check your connection and try again.' }, 503);
  }
}
