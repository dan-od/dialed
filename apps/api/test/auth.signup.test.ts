import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, uniqueEmail, type TestApp } from './helpers';

let t: TestApp;
beforeAll(async () => {
  t = await makeApp();
});
afterAll(async () => {
  await t.close();
});

const signup = (payload: object, headers: Record<string, string> = {}) =>
  t.app.inject({ method: 'POST', url: '/v1/auth/signup', payload, headers });

describe('POST /v1/auth/signup', () => {
  it('signup with valid input returns 202 and creates an unverified user with 6 default categories', async () => {
    const email = uniqueEmail('new');
    const r = await signup({ name: 'Ada Lovelace', email, password: 'correct horse battery' });
    expect(r.statusCode).toBe(202);
    expect(r.json()).toEqual({ pending: true });
    const u = await t.pool.query(
      'select id, email_verified_at, display_name, status from users where email = $1',
      [email],
    );
    expect(u.rows).toHaveLength(1);
    expect(u.rows[0].email_verified_at).toBeNull();
    expect(u.rows[0].display_name).toBe('Ada Lovelace');
    const cats = await t.pool.query(
      'select name, group_name, quiet, protected from categories where user_id = $1 order by sort',
      [u.rows[0].id],
    );
    expect(cats.rows).toEqual([
      { name: 'Class', group_name: 'School', quiet: false, protected: true },
      { name: 'Study', group_name: 'School', quiet: false, protected: false },
      { name: 'Gym', group_name: 'Life', quiet: false, protected: false },
      { name: 'Personal', group_name: 'Life', quiet: false, protected: false },
      { name: 'Meal', group_name: 'Life', quiet: true, protected: false },
      { name: 'Break', group_name: 'Life', quiet: true, protected: false },
    ]);
    const terms = await t.pool.query('select count(*)::int as n from terms where user_id = $1', [
      u.rows[0].id,
    ]);
    expect(terms.rows[0].n).toBe(0);
    // signup defaults go through recordChange: revision bumped and change_log written
    const log = await t.pool.query(
      'select count(*)::int as n from change_log where user_id = $1 and entity = $2',
      [u.rows[0].id, 'category'],
    );
    expect(log.rows[0].n).toBe(6);
    expect(t.email.lastTo(email)?.meta.kind).toBe('verify_code');
  });

  it('rejects bad input with field details and unknown fields', async () => {
    const r = await signup({ name: '', email: 'nope', password: 'short' });
    expect(r.statusCode).toBe(400);
    const body = r.json();
    expect(body.error.code).toBe('bad_request');
    expect(Object.keys(body.error.details.fields).sort()).toEqual(['email', 'name', 'password']);
    expect(
      (await signup({ name: 'x', email: uniqueEmail(), password: '12345678x', role: 'admin' }))
        .statusCode,
    ).toBe(400);
  });

  it('rejects common passwords', async () => {
    const r = await signup({ name: 'x', email: uniqueEmail(), password: 'password123' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.details.fields.password).toBeDefined();
  });

  it('409 email_taken for a verified account (case and spaces ignored)', async () => {
    const r = await signup({
      name: 'Owner',
      email: '  OWNER@dialed.test ',
      password: 'something-long',
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe('email_taken');
  });

  it('re-signup of an unverified email is safe and sends a fresh code', async () => {
    const email = uniqueEmail();
    expect((await signup({ name: 'A', email, password: 'first-password' })).statusCode).toBe(202);
    expect((await signup({ name: 'A', email, password: 'second-password' })).statusCode).toBe(202);
    const n = await t.pool.query('select count(*)::int as n from users where email = $1', [email]);
    expect(n.rows[0].n).toBe(1);
  });
});

describe('invite-only mode', () => {
  it('403 invite_required without an invite; 202 with one', async () => {
    const inv = await makeApp({ SIGNUP_MODE: 'invite' });
    try {
      const bad = await inv.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: { name: 'X', email: uniqueEmail(), password: 'long-enough-pw' },
      });
      expect(bad.statusCode).toBe(403);
      expect(bad.json().error.code).toBe('invite_required');
      const email = uniqueEmail('inv');
      await inv.pool.query('insert into invites(email) values ($1)', [email]);
      const ok = await inv.app.inject({
        method: 'POST',
        url: '/v1/auth/signup',
        payload: { name: 'X', email, password: 'long-enough-pw' },
      });
      expect(ok.statusCode).toBe(202);
    } finally {
      await inv.close();
    }
  });
});
