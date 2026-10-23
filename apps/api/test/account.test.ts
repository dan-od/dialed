import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, OWNER, login, makeApp, TEST_NOW, type TestApp } from './helpers';

// Flow 09: this phone's notification prefs (PUT /v1/devices/current) and Export my data (GET /v1/account/export).
let t: TestApp;
let alice: Awaited<ReturnType<typeof login>>;
let bob: Awaited<ReturnType<typeof login>>;
beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  alice = await login(t, ALICE.email);
  bob = await login(t, BOB.email);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.pool.query(`delete from audit_log where action = 'export'`);
});
const auth = (s: { access_token: string }) => ({ authorization: `Bearer ${s.access_token}` });

describe('device prefs', () => {
  it('starts from the defaults and keeps what this phone sets', async () => {
    const g = await t.app.inject({
      method: 'GET',
      url: '/v1/devices/current',
      headers: auth(alice),
    });
    expect(g.statusCode).toBe(200);
    expect(g.json().prefs).toEqual({
      lock_mode: 'live',
      line_on: true,
      heads_up_min: null,
      meal_notes: false,
      plan_pushes: true,
      daily_cap: 6,
    });
    const p = await t.app.inject({
      method: 'PUT',
      url: '/v1/devices/current',
      headers: auth(alice),
      payload: { prefs: { lock_mode: 'line', daily_cap: 7, heads_up_min: 10 } },
    });
    expect(p.statusCode).toBe(200);
    expect(p.json().prefs).toMatchObject({ lock_mode: 'line', daily_cap: 7, heads_up_min: 10 });
    const again = await t.app.inject({
      method: 'GET',
      url: '/v1/devices/current',
      headers: auth(alice),
    });
    expect(again.json().prefs).toMatchObject({ lock_mode: 'line', meal_notes: false });
    // Another person's phone is untouched.
    const b = await t.app.inject({ method: 'GET', url: '/v1/devices/current', headers: auth(bob) });
    expect(b.json().prefs.lock_mode).toBe('live');
  });
  it('refuses values outside the rules and unknown fields', async () => {
    for (const prefs of [
      { daily_cap: 0 },
      { daily_cap: 21 },
      { heads_up_min: 15 },
      { colour: 'x' },
    ]) {
      const r = await t.app.inject({
        method: 'PUT',
        url: '/v1/devices/current',
        headers: auth(alice),
        payload: { prefs },
      });
      expect(r.statusCode).toBe(400);
    }
    const anon = await t.app.inject({ method: 'PUT', url: '/v1/devices/current', payload: {} });
    expect(anon.statusCode).toBe(401);
  });
});

describe('export my data', () => {
  const exp = (s = alice) =>
    t.app.inject({ method: 'GET', url: '/v1/account/export', headers: auth(s) });
  it('streams a zip with dialed-export.json (dialed-export/v1) and dialed.ics, never cached', async () => {
    const r = await exp();
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/zip');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['content-disposition']).toContain('dialed-export.zip');
    const files = unzipSync(new Uint8Array(r.rawPayload));
    expect(Object.keys(files).sort()).toEqual(['dialed-export.json', 'dialed.ics']);
    const json = JSON.parse(strFromU8(files['dialed-export.json']!));
    expect(json.schema).toBe('dialed-export/v1');
    expect(json.user).toMatchObject({ email: ALICE.email, time_zone: 'America/Toronto' });
    for (const k of ['categories', 'terms', 'routines', 'routine_blocks', 'overrides', 'plans'])
      expect(Array.isArray(json[k])).toBe(true);
    expect(json.categories.map((c: { name: string }) => c.name)).toContain('Speedwatch Ontario');
    // Own rows only; no secrets.
    const text = strFromU8(files['dialed-export.json']!);
    expect(text).not.toContain(BOB.id);
    for (const secret of ['password_hash', 'token', 'apns', 'refresh'])
      expect(text.toLowerCase()).not.toContain(secret);
    const ics = strFromU8(files['dialed.ics']!);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
    expect(uids.length).toBeGreaterThan(0);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids[0]).toMatch(/^[0-9a-f-]{36}-2026\d{4}@dialed\r?$/);
    expect(ics).toMatch(/DTSTART;TZID=America\/Toronto:2026\d{4}T\d{6}/);
  });
  it('allows 3 exports a day', async () => {
    for (let i = 0; i < 3; i++) expect((await exp()).statusCode).toBe(200);
    const r = await exp();
    expect(r.statusCode).toBe(429);
    expect(r.json().error.message).toBe('You can export 3 times a day. Try again tomorrow.');
    expect((await exp(bob)).statusCode).toBe(200);
  });
  it('the owner’s calendar holds the Fall term week by week', async () => {
    const owner = await login(t, OWNER.email);
    const r = await exp(owner);
    const ics = strFromU8(unzipSync(new Uint8Array(r.rawPayload))['dialed.ics']!);
    // Tue Oct 20: Cryptography lecture 8:10–11:00 (resolved from the routine).
    expect(ics).toMatch(
      /DTSTART;TZID=America\/Toronto:20261020T081000\r\nDTEND;TZID=America\/Toronto:20261020T110000\r\nSUMMARY:Cryptography lecture/,
    );
    expect(ics.split('BEGIN:VEVENT').length - 1).toBeGreaterThan(300);
  });
});
