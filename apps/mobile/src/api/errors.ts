import type { ErrorCode } from '@dialed/contracts';

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 0,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Client copy for codes the app shows itself (never raw codes). Server messages are used for the rest. */
export const COPY: Partial<Record<ErrorCode, string>> = {
  offline: 'You’re offline.',
  server_error: 'Dialed couldn’t reach the server. Try again.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
  unauthorized: 'You were signed out. Sign in again.',
};
