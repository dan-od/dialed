import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALICE, DEV_PASSWORD, login, makeApp, OWNER, uniqueEmail, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

const post = (url: string, payload: object, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'POST', url, payload, headers });

async function signedUp() {
  const email = uniqueEmail();
  await post('/v1/auth/signup', { name: 'Grace Hopper', email, password: 'compilers-rule' });
  const msg = t.email.lastTo(email)!;
  return { email, code: msg.meta.kind === 'verify_code' ? msg.meta.code : '' };
}

describe('verify', () => {
  it('right code → tokens, is_new, verified; code is single-use', async () => {
    const { email, code } = await signedUp();
    const r = await post('/v1/auth/verify', {
      email,
      code: `${code.slice(0, 3)} ${code.slice(3)}`,
      time_zone: 'America/Vancouver',
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.is_new).toBe(true);
    expect(body.user).toMatchObject({
      email,
      display_name: 'Grace Hopper',
      time_zone: 'America/Vancouver',
    });
    expect(body.access_token.split('.')).toHaveLength(3);
    expect((await post('/v1/auth/verify', { email, code })).json().error.code).toBe('code_expired');
  });

  it('wrong code → code_invalid; 6th try consumes the code (never a 500)', async () => {
    const { email, code } = await signedUp();
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      const r = await post('/v1/auth/verify', { email, code: wrong });
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('code_invalid');
    }
    const sixth = await post('/v1/auth/verify', { email, code });
    expect(sixth.statusCode).toBe(400);
    expect(sixth.json().error.code).toBe('code_invalid');
    expect((await post('/v1/auth/verify', { email, code })).json().error.code).toBe('code_expired');
  });

  it('expired code → code_expired', async () => {
    const { email, code } = await signedUp();
    await t.pool.query(
      "update email_codes set expires_at = now() - interval '1 minute' where email = $1",
      [email],
    );
    expect((await post('/v1/auth/verify', { email, code })).json().error.code).toBe('code_expired');
  });

  it('resend is limited to 1/min per email', async () => {
    const { email } = await signedUp();
    const r = await post('/v1/auth/resend', { email, purpose: 'verify' });
    expect(r.statusCode).toBe(429);
    expect(r.json().error.code).toBe('rate_limited');
    await t.pool.query(
      "update email_codes set created_at = now() - interval '2 minutes' where email = $1",
      [email],
    );
    expect((await post('/v1/auth/resend', { email, purpose: 'verify' })).statusCode).toBe(202);
  });
});

describe('login', () => {
  it('seeded owner signs in with the dev password; is_new false', async () => {
    const r = await post('/v1/auth/login', { email: OWNER.email, password: DEV_PASSWORD });
    expect(r.statusCode).toBe(200);
    expect(r.json().is_new).toBe(false);
    expect(r.json().user.id).toBe(OWNER.id);
  });

  it('wrong password and unknown email give the same bad_credentials', async () => {
    const a = await post('/v1/auth/login', { email: OWNER.email, password: 'nope-nope' });
    const b = await post('/v1/auth/login', { email: 'nobody@dialed.test', password: 'nope-nope' });
    expect(a.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
    expect(a.json().error.code).toBe('bad_credentials');
  });

  it('login/check tells the client whether to show "No account"', async () => {
    expect((await post('/v1/auth/login/check', { email: OWNER.email })).json()).toEqual({
      exists: true,
    });
    expect((await post('/v1/auth/login/check', { email: 'nobody@dialed.test' })).json()).toEqual({
      exists: false,
    });
  });

  it('unverified account → forbidden with verify_required and a fresh code', async () => {
    const { email } = await signedUp();
    await t.pool.query(
      "update email_codes set created_at = now() - interval '2 minutes' where email = $1",
      [email],
    );
    const r = await post('/v1/auth/login', { email, password: 'compilers-rule' });
    expect(r.statusCode).toBe(403);
    expect(r.json().error.details).toEqual({ verify_required: true });
  });

  it('deleted account cannot sign in', async () => {
    const { email, code } = await signedUp();
    await post('/v1/auth/verify', { email, code });
    await t.pool.query("update users set status = 'deleted', deleted_at = now() where email = $1", [
      email,
    ]);
    expect(
      (await post('/v1/auth/login', { email, password: 'compilers-rule' })).json().error.code,
    ).toBe('bad_credentials');
    expect((await post('/v1/auth/login/check', { email })).json()).toEqual({ exists: false });
  });
});

describe('sessions', () => {
  it('refresh rotates; reusing a rotated token revokes the family', async () => {
    const s = await login(t, ALICE.email);
    const r1 = await post('/v1/auth/refresh', { refresh_token: s.refresh_token });
    expect(r1.statusCode).toBe(200);
    const s2 = r1.json();
    expect(s2.refresh_token).not.toBe(s.refresh_token);
    const reuse = await post('/v1/auth/refresh', { refresh_token: s.refresh_token });
    expect(reuse.statusCode).toBe(401);
    // the whole family is gone, including the newest token
    expect((await post('/v1/auth/refresh', { refresh_token: s2.refresh_token })).statusCode).toBe(
      401,
    );
    const pull = await t.app.inject({
      method: 'GET',
      url: '/v1/sync/pull?since=0',
      headers: { authorization: `Bearer ${s2.access_token}` },
    });
    expect(pull.statusCode).toBe(401);
  });

  it('logout revokes this session; access token stops working; repeat is safe', async () => {
    const s = await login(t, ALICE.email);
    const h = { authorization: `Bearer ${s.access_token}` };
    expect(
      (await t.app.inject({ method: 'POST', url: '/v1/auth/logout', headers: h })).statusCode,
    ).toBe(204);
    expect(
      (await t.app.inject({ method: 'GET', url: '/v1/sync/pull', headers: h })).statusCode,
    ).toBe(401);
    expect((await post('/v1/auth/refresh', { refresh_token: s.refresh_token })).statusCode).toBe(
      401,
    );
  });
});

describe('forgot / reset', () => {
  it('forgot always 202; reset sets the password, revokes other sessions, single use', async () => {
    const email = uniqueEmail('reset');
    await post('/v1/auth/signup', { name: 'R', email, password: 'old-password-1' });
    const vcode = t.email.lastTo(email)!.meta;
    await post('/v1/auth/verify', { email, code: vcode.kind === 'verify_code' ? vcode.code : '' });
    const old = await login(t, email, 'old-password-1');
    expect(
      (await post('/v1/auth/password/forgot', { email: 'nobody@dialed.test' })).statusCode,
    ).toBe(202);
    expect((await post('/v1/auth/password/forgot', { email })).statusCode).toBe(202);
    const m = t.email.lastTo(email)!.meta;
    expect(m.kind).toBe('reset_link');
    const url = m.kind === 'reset_link' ? m.url : '';
    expect(url).toMatch(/^http:\/\/localhost:8080\/reset#token=/);
    const token = url.split('#token=')[1]!;
    const r = await post('/v1/auth/password/reset', { token, password: 'new-password-2' });
    expect(r.statusCode).toBe(200);
    expect(
      (await post('/v1/auth/password/reset', { token, password: 'new-password-3' })).statusCode,
    ).toBe(400);
    expect((await post('/v1/auth/refresh', { refresh_token: old.refresh_token })).statusCode).toBe(
      401,
    );
    await login(t, email, 'new-password-2');
  });
});
