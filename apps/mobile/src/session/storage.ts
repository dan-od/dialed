import * as SecureStore from 'expo-secure-store';
import type { UserOut } from '@dialed/contracts';

// Keychain, this device only, never in backups (SECURITY.md). The App Group never holds tokens.
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const SESSION = 'dialed.session';
const PENDING = 'dialed.pending_signup';

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  user: UserOut;
}

export async function readSession(): Promise<StoredSession | null> {
  try {
    const v = await SecureStore.getItemAsync(SESSION, OPTS);
    return v ? (JSON.parse(v) as StoredSession) : null;
  } catch {
    return null;
  }
}
export const writeSession = (s: StoredSession) =>
  SecureStore.setItemAsync(SESSION, JSON.stringify(s), OPTS);
export const clearSession = () => SecureStore.deleteItemAsync(SESSION, OPTS);

/** Verify screen reopened after an app kill resumes with the stored email (Flow 01 hidden states). */
export async function readPending(): Promise<{ email: string; name: string } | null> {
  try {
    const v = await SecureStore.getItemAsync(PENDING, OPTS);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
export const writePending = (p: { email: string; name: string }) =>
  SecureStore.setItemAsync(PENDING, JSON.stringify(p), OPTS);
export const clearPending = () => SecureStore.deleteItemAsync(PENDING, OPTS);
