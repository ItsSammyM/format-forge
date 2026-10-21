import { createAuth, ensureAuthSchema } from '../../../src/lib/auth-server';
import type { AuthEnv } from '../../../src/lib/auth-server';

interface Context { request: Request; env: AuthEnv }

export function onRequest({ request, env }: Context) {
  const auth = createAuth(env);
  return ensureAuthSchema(auth, env.DB as object).then(() => auth.handler(request));
}
