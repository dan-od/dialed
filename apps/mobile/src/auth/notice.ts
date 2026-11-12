import type { ErrorCode } from '@dialed/contracts';

export type AuthNotice =
  | { kind: 'taken' }
  | { kind: 'invite' }
  | { kind: 'none' }
  | { kind: 'offline' }
  | { kind: 'slow' }
  | { kind: 'email' }
  | { kind: 'server' }
  | null;

/** API error code → the Flow 01 notice. "Couldn't reach the server" only for what isn't explained here. */
export function noticeFor(code: ErrorCode): Exclude<AuthNotice, null> {
  switch (code) {
    case 'offline':
      return { kind: 'offline' };
    case 'rate_limited':
      return { kind: 'slow' };
    case 'email_taken':
      return { kind: 'taken' };
    case 'invite_required':
      return { kind: 'invite' };
    case 'email_send_failed':
      return { kind: 'email' };
    default:
      return { kind: 'server' };
  }
}
