import { z } from 'zod';

/** error-taxonomy global contract (00_Flow_Contracts.md). */
export const ERROR_CODES = [
  'bad_request',
  'unauthorized',
  'token_expired',
  'forbidden',
  'not_found',
  'conflict',
  'version_conflict',
  'rate_limited',
  'daily_limit',
  'invite_required',
  'email_taken',
  'bad_credentials',
  'no_account',
  'code_invalid',
  'code_expired',
  'plan_stale',
  'plan_changed',
  'plan_invalid',
  'plan_not_ready',
  'validation_failed',
  'resync_required',
  'provider_error',
  'provider_key_invalid',
  'vision_unavailable',
  'file_unsupported',
  'file_too_large',
  'offline',
  'server_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    retryable: z.boolean(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
