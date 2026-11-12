import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { makeApp, uniqueEmail, type TestApp } from './helpers';
import type { EmailMessage } from '../src/email';

const lines: string[] = [];
let t: TestApp;
let realSend: (msg: EmailMessage) => Promise<void>;
beforeAll(async () => {
  t = await makeApp({ LOG_LEVEL: 'info' }, { write: (l) => void lines.push(l) });
  realSend = t.email.send.bind(t.email);
});
afterAll(async () => {
  await t.close();
});

/** Next send fails like a wrong SMTP host did on the homelab. */
function failNextSend() {
  t.email.send = async () => {
    t.email.send = realSend;
    throw Object.assign(new Error('getaddrinfo ENOTFOUND smtp.resend.dev'), {
      code: 'EDNS',
    });
  };
}

const post = (url: string, payload: object) => t.app.inject({ method: 'POST', url, payload });

describe('email send failures (homelab sign-up 500)', () => {
  it('signup returns email_send_failed, logs the cause, and the same email can retry and finish', async () => {
    const email = uniqueEmail('smtp');
    const body = { name: 'Ada', email, password: 'correct horse battery' };
    failNextSend();
    lines.length = 0;
    const r = await post('/v1/auth/signup', body);
    expect(r.json().error.code).toBe('email_send_failed');
    expect(r.json().error.message).toBe('We couldn’t send your code. Try again in a minute.');
    expect(r.json().error.retryable).toBe(true);
    expect(r.statusCode).toBe(502);
    const logged = lines.join('\n');
    expect(logged).toContain('ENOTFOUND smtp.resend.dev');
    expect(logged).not.toContain('correct horse battery');

    const again = await post('/v1/auth/signup', body);
    expect(again.statusCode).toBe(202);
    const code = t.email.lastTo(email)!.meta;
    expect(code.kind).toBe('verify_code');
    const v = await post('/v1/auth/verify', {
      email,
      code: code.kind === 'verify_code' ? code.code : '',
    });
    expect(v.statusCode).toBe(200);
  });

  it('resend returns email_send_failed and the failed send does not count toward the rate limit', async () => {
    const email = uniqueEmail('smtp');
    expect(
      (await post('/v1/auth/signup', { name: 'Ada', email, password: 'correct horse battery' }))
        .statusCode,
    ).toBe(202);
    // Signup's own code is older than the 1-per-minute window.
    await t.db.execute(
      sql`update email_codes set created_at = now() - interval '2 minutes' where email = ${email}`,
    );
    failNextSend();
    const r = await post('/v1/auth/resend', { email, purpose: 'verify' });
    expect(r.json().error.code).toBe('email_send_failed');
    const again = await post('/v1/auth/resend', { email, purpose: 'verify' });
    expect(again.statusCode).toBe(202);
  });
});
