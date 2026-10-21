import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, OWNER, type TestApp } from './helpers';

const lines: string[] = [];
let t: TestApp;
beforeAll(async () => {
  t = await makeApp(
    { LOG_LEVEL: 'info' },
    {
      write: (l) => {
        lines.push(l);
      },
    },
  );
});
afterAll(async () => {
  await t.close();
});

describe('observability', () => {
  it('echoes a valid x-request-id and generates one otherwise', async () => {
    const id = '0f8f3a4e-1b2c-4d5e-8f90-123456789abc';
    expect(
      (await t.app.inject({ method: 'GET', url: '/healthz', headers: { 'x-request-id': id } }))
        .headers['x-request-id'],
    ).toBe(id);
    const gen = (
      await t.app.inject({
        method: 'GET',
        url: '/healthz',
        headers: { 'x-request-id': 'evil\nheader' },
      })
    ).headers['x-request-id'];
    expect(gen).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('logs never contain tokens, passwords, provider keys or query strings', async () => {
    const secretPw = 'super-secret-password-123';
    await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: OWNER.email, password: secretPw },
    });
    await t.app.inject({
      method: 'GET',
      url: '/v1/sync/pull?since=0&cursor=SECRETCURSOR',
      headers: { authorization: 'Bearer SECRET.JWT.VALUE', 'x-provider-key': 'sk-SECRET-KEY' },
    });
    await t.app.inject({ method: 'GET', url: '/reset?token=SECRETRESET' });
    const all = lines.join('\n');
    expect(all.length).toBeGreaterThan(0);
    for (const s of [secretPw, 'SECRET.JWT.VALUE', 'sk-SECRET-KEY', 'SECRETCURSOR', 'SECRETRESET'])
      expect(all).not.toContain(s);
    expect(all).toContain('/v1/sync/pull');
  });

  it('errors use the envelope and never leak stack traces', async () => {
    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: '{bad json',
      headers: { 'content-type': 'application/json' },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({
      error: { code: 'bad_request', message: expect.any(String), retryable: false },
    });
    expect(r.body).not.toMatch(/\n\s+at /);
    const nf = await t.app.inject({ method: 'GET', url: '/v1/nope' });
    expect(nf.json().error.code).toBe('not_found');
  });

  it('app tokens are refused at /mcp', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/mcp', payload: {} });
    expect(r.statusCode).toBe(401);
    expect(r.headers['www-authenticate']).toContain('resource_metadata');
  });
});
