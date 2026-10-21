import { useState } from 'react';
import { ApiError } from '../api/errors';
import { haptic } from '../lib/haptics';

export type AuthNotice =
  | { kind: 'taken' }
  | { kind: 'invite' }
  | { kind: 'none' }
  | { kind: 'offline' }
  | { kind: 'slow' }
  | { kind: 'server' }
  | null;

/** Busy state + mapping of API error codes to the Flow 01 states. Never shows raw codes. */
export function useAuthCall() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<AuthNotice>(null);
  async function run<T>(
    fn: () => Promise<T>,
    onError?: (e: ApiError) => boolean,
  ): Promise<T | undefined> {
    setBusy(true);
    setNotice(null);
    try {
      return await fn();
    } catch (e) {
      const err =
        e instanceof ApiError
          ? e
          : new ApiError('server_error', 'Dialed couldn’t reach the server. Try again.');
      if (onError?.(err)) return undefined;
      haptic.warning();
      if (err.code === 'offline') setNotice({ kind: 'offline' });
      else if (err.code === 'rate_limited') setNotice({ kind: 'slow' });
      else if (err.code === 'email_taken') setNotice({ kind: 'taken' });
      else if (err.code === 'invite_required') setNotice({ kind: 'invite' });
      else setNotice({ kind: 'server' });
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, notice, setNotice, run };
}
