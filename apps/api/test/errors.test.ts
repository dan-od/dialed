import { describe, expect, it } from 'vitest';
import { appError } from '../src/lib/errors';

describe('plan error codes (error-taxonomy)', () => {
  it.each([
    ['plan_stale', 409, false],
    ['plan_changed', 409, false],
    ['plan_invalid', 409, false],
    ['plan_not_ready', 409, false],
    ['validation_failed', 422, false],
    ['provider_error', 502, true],
    ['provider_key_invalid', 400, false],
    ['daily_limit', 429, false],
  ] as const)('%s → %i, retryable=%s', (code, status, retryable) => {
    const err = appError(code);
    expect(err.status).toBe(status);
    expect(err.toBody().error.retryable).toBe(retryable);
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('an explicit message overrides the default', () => {
    const err = appError('plan_invalid', 'Custom sentence.');
    expect(err.message).toBe('Custom sentence.');
    expect(err.toBody()).toEqual({
      error: { code: 'plan_invalid', message: 'Custom sentence.', retryable: false },
    });
  });

  it('details are included only when given', () => {
    const err = appError('plan_changed', undefined, { current_version: 3 });
    expect(err.toBody().error.details).toEqual({ current_version: 3 });
    expect(appError('plan_changed').toBody().error.details).toBeUndefined();
  });
});
