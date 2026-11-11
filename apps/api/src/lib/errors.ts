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
  plan_stale: 409,
  plan_changed: 409,
  plan_invalid: 409,
  plan_not_ready: 409,
  validation_failed: 422,
  provider_error: 502,
  provider_key_invalid: 400,
  byo_key_required: 400,
  byo_key_unavailable: 400,
  vision_unavailable: 400,
  file_unsupported: 400,
  file_too_large: 413,
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
  daily_limit: 'You’ve used today’s limit. Try again tomorrow.',
  plan_stale: 'Your schedule changed since this plan was drafted. Redo it so nothing clashes.',
  plan_changed: 'This plan was just updated. Check it again.',
  plan_invalid: 'That plan doesn’t fit your schedule anymore. Check the changes.',
  plan_not_ready: 'That plan isn’t ready to review yet.',
  validation_failed: 'Couldn’t make a plan that fits your limits. Try rewording it.',
  provider_error: 'Couldn’t reach the AI provider. Try again.',
  provider_key_invalid: 'That AI key was refused. Check it in Settings.',
  byo_key_required: 'Add your own AI key in Settings to plan this way.',
  byo_key_unavailable:
    'Your AI key is needed for this plan but was not sent. Open the plan in the app to retry.',
  vision_unavailable:
    'Your AI provider can’t read images. Use a text PDF or Word file, or set up a vision-capable provider.',
  file_unsupported: 'Use a photo, screenshot, PDF or Word file under 15 MB.',
  file_too_large: 'That file is too large. Use a file under 15 MB.',
  server_error: 'Dialed couldn’t reach the server. Try again.',
};

const RETRYABLE = new Set<ErrorCode>([
  'rate_limited',
  'server_error',
  'conflict',
  'provider_error',
]);

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
