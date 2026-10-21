import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';

export interface AuthEnv {
  DB: unknown;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
}

interface LibraryCleanupDatabase {
  prepare(query: string): { bind(...values: unknown[]): { run(): Promise<unknown> } };
}

const schemaReady = new WeakMap<object, Promise<void>>();

export function createAuth(env: AuthEnv) {
  return betterAuth({
    appName: 'Format Forge',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB as never,
    user: {
      deleteUser: {
        enabled: true,
        afterDelete: async user => {
          await (env.DB as LibraryCleanupDatabase).prepare('DELETE FROM library_chunks WHERE user_id = ?').bind(user.id).run();
        },
      },
    },
    trustedOrigins: [env.BETTER_AUTH_URL],
    emailAndPassword: { enabled: false },
    socialProviders: {
      discord: {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        scope: ['identify', 'email'],
        mapProfileToUser: profile => ({
          email: profile.email ?? `${profile.id}@discord.placeholder.invalid`,
        }),
      },
    },
  });
}

export function ensureAuthSchema(auth: ReturnType<typeof createAuth>, database: object) {
  let ready = schemaReady.get(database);
  if (!ready) {
    ready = getMigrations(auth.options)
      .then(({ runMigrations }) => runMigrations())
      .catch(error => {
        schemaReady.delete(database);
        throw error;
      });
    schemaReady.set(database, ready);
  }
  return ready;
}
