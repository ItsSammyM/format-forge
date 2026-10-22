import { createAuth, ensureAuthSchema } from '../../src/lib/auth-server';
import type { AuthEnv } from '../../src/lib/auth-server';

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<T[]>;
}
type Env = Omit<AuthEnv, 'DB'> & { DB: D1Database };
interface Context { request: Request; env: Env }

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function getUserId(request: Request, auth: ReturnType<typeof createAuth>) {
  const result = await auth.api.getSession({ headers: request.headers });
  return result?.user?.id ?? null;
}

export async function onRequest({ request, env }: Context) {
  if (request.method !== 'DELETE' && request.method !== 'GET' && request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405);
  let userId: string | null;
  try {
    const auth = createAuth(env);
    await ensureAuthSchema(auth, env.DB as object);
    userId = await getUserId(request, auth);
  } catch (error) {
    console.error('[api/library] Failed to initialize auth or verify the session.', error);
    return json({ error: 'We couldn’t verify your sign-in. Please sign out and sign in again.' }, 503);
  }
  if (!userId) return json({ error: 'Please sign in to access your library.' }, 401);

  if (request.method !== 'DELETE') {
    return json({ error: 'Please refresh the page to sync your account library.' }, 409);
  }

  try {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM library_chunks WHERE user_id = ?').bind(userId),
      env.DB.prepare('DELETE FROM library_records WHERE user_id = ?').bind(userId),
    ]);
    return json({ deleted: true });
  } catch (error) {
    console.error('[api/library] Failed to delete account library.', error);
    return json({ error: 'We couldn’t clear your saved library. Please try again.' }, 503);
  }
}
