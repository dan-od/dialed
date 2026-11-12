import { useState } from 'react';
import { ApiError } from '../api/errors';
import { haptic } from '../lib/haptics';
import { noticeFor, type AuthNotice } from './notice';

export type { AuthNotice } from './notice';

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
      setNotice(noticeFor(err.code));
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  return { busy, notice, setNotice, run };
}
