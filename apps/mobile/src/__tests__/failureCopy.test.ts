import { failureCopy } from '../plan/copy';

const plan = (
  error_code: string | null,
  validation_errors: {
    code: string;
    change_index: number;
    message: string;
    subject?: string;
  }[] = [],
  attempts = 0,
) => ({ error_code, validation_errors, attempts });

describe('failureCopy', () => {
  it('validation_failed never says "can’t reach", even after a Q&A and retries', () => {
    const c = failureCopy(
      plan(
        'validation_failed',
        [
          {
            code: 'protected_block',
            change_index: 0,
            message: 'm',
            subject: '9:40 Advanced Networking I',
          },
        ],
        2,
      ),
    );
    expect(`${c.title} ${c.body} ${c.reason}`).not.toMatch(/reach|didn’t answer/i);
    expect(c.body).toBe('Claude couldn’t make a plan that fits your schedule’s rules.');
    expect(c.reason).toBe(
      'Your 9:40 Advanced Networking I class is protected. Say which classes to skip.',
    );
  });

  it('names how many more classes were protected', () => {
    const c = failureCopy(
      plan('validation_failed', [
        {
          code: 'protected_block',
          change_index: 0,
          message: 'm',
          subject: '9:40 Advanced Networking I',
        },
        { code: 'protected_block', change_index: 1, message: 'm', subject: '14:10 Networking lab' },
      ]),
    );
    expect(c.reason).toBe(
      'Your 9:40 Advanced Networking I class and 1 more are protected. Say which classes to skip.',
    );
  });

  it.each([
    ['overlap', /clashed/],
    ['bad_time', /time didn’t work/],
    ['too_many_changes', /more than 25/],
    ['unknown_ref', /didn’t match your schedule/],
  ])('%s gets a plain reason', (code, re) => {
    expect(
      failureCopy(plan('validation_failed', [{ code, change_index: 0, message: 'm' }])).reason,
    ).toMatch(re);
  });

  it('"can’t reach" only for real network or provider failures, after retries run out', () => {
    expect(failureCopy(plan('provider_error', [], 0)).title).toBe('Claude didn’t answer');
    expect(failureCopy(plan('provider_error', [], 2)).title).toBe('Still can’t reach Claude');
    expect(failureCopy(plan('provider_error', [], 2)).canRetry).toBe(false);
    expect(failureCopy(plan('server_error', [], 0)).body).toMatch(/server/);
  });

  it.each([
    'too_many_questions',
    'provider_key_invalid',
    'byo_key_required',
    'byo_key_unavailable',
    'daily_limit',
    'cancelled',
    'validation_failed',
  ])('%s has its own copy, not the network wording', (code) => {
    const c = failureCopy(plan(code, [], 2));
    expect(`${c.title} ${c.body}`).not.toMatch(/reach Claude|didn’t answer/);
  });

  it('key problems point to Settings; the daily limit can’t be retried', () => {
    expect(failureCopy(plan('provider_key_invalid')).settings).toBe(true);
    expect(failureCopy(plan('daily_limit')).canRetry).toBe(false);
  });
});
