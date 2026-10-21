import type { ErrorCode } from '@dialed/contracts';

const STATUS: Partial<Record<ErrorCode, number>> = {
  bad_request: 400,
  unauthorized: 401,
  token_expired: 401,
  bad_credentials: 401,
  forbidden: 403,
  invite_required: 403,
  not_found: 404,
  conflict: 409,
  version_conflict: 409,
  email_taken: 409,
  resync_required: 409,
  code_invalid: 400,
  code_expired: 400,
  rate_limited: 429,
  daily_limit: 429,
  server_error: 500,
};

/** User-facing defaults: plain, one sentence (error-taxonomy). */
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  bad_request: 'Something in that request wasn’t right.',
  unauthorized: 'Sign in to continue.',
  token_expired: 'Your session timed out. Sign in again.',
  forbidden: 'You can’t do that.',
  not_found: 'That isn’t available.',
  conflict: 'That changed somewhere else. Try again.',
  version_conflict: 'That changed on another device.',
  rate_limited: 'Too many tries. Wait a minute and try again.',
  invite_required: 'Dialed is invite-only for now. Ask for an invite with this email.',
  email_taken: 'There’s already an account for that email.',
  bad_credentials: 'That password doesn’t match. Try again, or reset it.',
  no_account: 'Nobody has signed up with that email yet.',
  code_invalid: 'That code doesn’t match. Check the newest email from Dialed.',
  code_expired: 'That code expired. Send a new one.',
  resync_required: 'Your phone needs a fresh copy of your schedule.',
  server_error: 'Dialed couldn’t reach the server. Try again.',
};

const RETRYABLE = new Set<ErrorCode>(['rate_limited', 'server_error', 'conflict']);

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message ?? MESSAGES[code] ?? 'Something went wrong.');
    this.status = STATUS[code] ?? 400;
  }
  toBody() {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryable: RETRYABLE.has(this.code),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export const appError = (code: ErrorCode, message?: string, details?: Record<string, unknown>) =>
  new AppError(code, message, details);
