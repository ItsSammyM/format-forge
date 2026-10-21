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

async function libraryRequest(method: 'GET' | 'PUT', library?: Library) {
  const response = await fetch('/api/library', {
    method,
    credentials: 'same-origin',
    headers: library ? { 'Content-Type': 'application/json' } : undefined,
    body: library ? JSON.stringify({ library }) : undefined,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(detail.error ?? 'Your account library is unavailable. Please try again.');
  }
  return response.json() as Promise<{ library: unknown | null }>;
}

export async function loadAccountLibrary(_session: AuthSession): Promise<Library | null> {
  const result = await libraryRequest('GET');
  if (result.library === null) return null;
  if (typeof result.library !== 'object' || Array.isArray(result.library)) throw new Error('We couldn’t read your saved library. Your copy on this device is unchanged.');
  return parseLibraryWithDefaults(JSON.stringify(result.library));
}

export async function saveAccountLibrary(_session: AuthSession, library: Library): Promise<void> {
  const compact = compactLibraryData(library);
  if (new TextEncoder().encode(JSON.stringify(compact)).byteLength > 32 * 1024 * 1024) {
    throw new Error('Your library is too large to sync. Export a backup and remove some saved data before trying again.');
  }
  await libraryRequest('PUT', compact);
}
