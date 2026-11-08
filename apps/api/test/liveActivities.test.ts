import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { login, makeApp, OWNER, type TestApp } from './helpers';
import { createHandlers } from '../src/jobs/handlers';
import {
  APPLE_EPOCH_S,
  appleDate,
  enqueueNightly,
  type ApnsRequest,
} from '../src/glance/activities';

// Flow 08 step 7: device registration, Live Activity reports and the la.* jobs (APNS_MODE=log).
let t: TestApp;
let clock = new Date('2037-10-19T12:00:00Z'); // Mon 8:00 am America/Toronto
const now = () => clock;
const sent: { token: string; req: ApnsRequest; meta: Record<string, unknown> }[] = [];
const logs: Record<string, unknown>[] = [];
let handlers: ReturnType<typeof createHandlers>;
let headers: { authorization: string };
let deviceId: string;
const START_TOKEN = 'ab'.repeat(32);
const ACTIVITY_TOKEN = 'cd'.repeat(32);

type Job = {
  id: number;
  kind: string;
  run_at: string;
  payload_json: Record<string, unknown>;
  dedupe_key: string;
};
async function jobs(kind: string): Promise<Job[]> {
  const { rows } = await t.db
    .execute<Job>(sql`select id, kind, run_at, payload_json, dedupe_key from jobs
    where kind = ${kind} and status = 'queued' and payload_json->>'device_id' = ${deviceId} order by run_at, id`);
  return rows;
}
async function activity(blockKey: string) {
  const { rows } = await t.db.execute<{
    state: string;
    push_token: string | null;
  }>(sql`select state, push_token
    from live_activities where device_id = ${deviceId} and block_key = ${blockKey}`);
  return rows[0];
}
const put = (url: string, payload: Record<string, unknown>) =>
  t.app.inject({ method: 'PUT', url, headers, payload });

beforeAll(async () => {
  t = await makeApp({ APPLE_TEAM_TIER: 'paid' }, undefined, now);
  const s = await login(t, OWNER.email);
  headers = { authorization: `Bearer ${s.access_token}` };
  handlers = createHandlers({
    db: t.db,
    config: t.config,
    now,
    log: (o) => logs.push(o),
    push: { send: async (token, req, meta) => void sent.push({ token, req, meta }) },
  });
});
afterAll(async () => {
  await t.db.execute(
    sql`delete from jobs where kind like 'la.%' and payload_json->>'user_id' = ${OWNER.id}`,
  );
  await t.db.execute(sql`delete from jobs where dedupe_key like ${`la.%${OWNER.id}%`}`);
  await t.db.execute(sql`delete from live_activities where user_id = ${OWNER.id}`);
  await t.close();
});
beforeEach(() => {
  sent.length = 0;
  logs.length = 0;
});

describe('PUT /v1/devices/current', () => {
  it('stores tokens, platform and prefs, returns the device id, and queues la.schedule', async () => {
    const r = await put('/v1/devices/current', {
      apns_token: 'ef'.repeat(32),
      live_activity_start_token: START_TOKEN,
      platform: 'ios',
      app_version: '1.0.0',
      prefs: { lock_mode: 'live' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { device_id: string; prefs: { lock_mode: string } };
    deviceId = body.device_id;
    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.prefs.lock_mode).toBe('live');
    const { rows } = await t.db.execute<Record<string, unknown>>(
      sql`select apns_token, live_activity_start_token, platform, app_version from devices where id = ${deviceId}`,
    );
    expect(rows[0]).toEqual({
      apns_token: 'ef'.repeat(32),
      live_activity_start_token: START_TOKEN,
      platform: 'ios',
      app_version: '1.0.0',
    });
    expect((await jobs('la.schedule')).length).toBeGreaterThanOrEqual(1);
    // Round trip: GET still answers with prefs.
    const g = await t.app.inject({ method: 'GET', url: '/v1/devices/current', headers });
    expect(g.json().prefs.lock_mode).toBe('live');
  });

  it('a null token clears it; omitting a token keeps it', async () => {
    await put('/v1/devices/current', { apns_token: null });
    const { rows } = await t.db.execute<Record<string, unknown>>(
      sql`select apns_token, live_activity_start_token from devices where id = ${deviceId}`,
    );
    expect(rows[0]).toEqual({ apns_token: null, live_activity_start_token: START_TOKEN });
  });

  it('rejects a token that isn’t hex', async () => {
    const r = await put('/v1/devices/current', { live_activity_start_token: 'not a token' });
    expect(r.statusCode).toBe(400);
  });
});

describe('la.schedule', () => {
  it('queues a start at each work block start and an end at each end, for the seed Monday and Tuesday', async () => {
    await handlers['la.schedule']({ user_id: OWNER.id, device_id: deviceId });
    const starts = await jobs('la.start');
    const ends = await jobs('la.end');
    const monday = starts.filter((j) => String(j.payload_json.block_key).endsWith('2037-10-19'));
    // Seed Monday: Adv Networking, Review, Sermon Sync, Cryptography prep, Gym, Sermon Sync, WellServices.
    expect(monday).toHaveLength(7);
    expect(new Date(monday[0]!.run_at).toISOString()).toBe('2037-10-19T13:40:00.000Z'); // 9:40 am
    expect(new Date(monday.at(-1)!.run_at).toISOString()).toBe('2037-10-20T00:30:00.000Z'); // 8:30 pm
    expect(starts.length).toBeGreaterThan(7); // Tuesday too
    expect(ends).toHaveLength(starts.length);
    const firstEnd = ends.find(
      (j) => j.payload_json.block_key === monday[0]!.payload_json.block_key,
    )!;
    expect(new Date(firstEnd.run_at).toISOString()).toBe('2037-10-19T15:00:00.000Z'); // 11:00 am
    expect(monday[0]!.dedupe_key).toBe(
      `la:${deviceId}:${String(monday[0]!.payload_json.block_key)}:start`,
    );
    // Quiet blocks (Breakfast, Lunch, Break, Dinner) never get one.
    const { rows } = await t.db.execute<{
      n: number;
    }>(sql`select count(*)::int as n from live_activities
      where device_id = ${deviceId} and block_key like '%:2037-10-19'`);
    expect(rows[0]!.n).toBe(7);
  });

  it('running it again doesn’t duplicate jobs', async () => {
    const before = [(await jobs('la.start')).length, (await jobs('la.end')).length];
    await handlers['la.schedule']({ user_id: OWNER.id, device_id: deviceId });
    await handlers['la.schedule']({ user_id: OWNER.id, device_id: deviceId });
    expect([(await jobs('la.start')).length, (await jobs('la.end')).length]).toEqual(before);
  });

  it('skips everything on the Personal Team (the app starts activities itself)', async () => {
    const p = await makeApp({ APPLE_TEAM_TIER: 'personal' }, undefined, now);
    const l: Record<string, unknown>[] = [];
    const h = createHandlers({ db: p.db, config: p.config, now, log: (o) => l.push(o) });
    await h['la.schedule']({ user_id: OWNER.id, device_id: deviceId });
    expect(l[0]!.msg).toMatch(/personal tier/);
    await p.close();
  });
});

describe('la.start', () => {
  it('builds the push-to-start payload (golden)', async () => {
    const [first] = await jobs('la.start');
    const key = String(first!.payload_json.block_key);
    clock = new Date('2037-10-19T13:40:00Z');
    await handlers['la.start'](first!.payload_json);
    expect(sent).toHaveLength(1);
    const { token, req } = sent[0]!;
    expect(token).toBe(START_TOKEN);
    expect(req.pushType).toBe('liveactivity');
    expect(req.topic).toBe('me.okoro.dialed.push-type.liveactivity');
    expect(req.priority).toBe(10);
    const at = (iso: string) => new Date(iso).getTime() / 1000 - APPLE_EPOCH_S;
    expect(req.payload).toEqual({
      aps: {
        timestamp: Date.UTC(2037, 9, 19, 13, 40) / 1000,
        event: 'start',
        'attributes-type': 'BlockActivityAttributes',
        attributes: {
          blockKey: key,
          title: 'Advanced Networking I',
          categoryColorHex: expect.stringMatching(/^#[0-9A-Fa-f]{6}$/),
          startsAt: at('2037-10-19T13:40:00Z'),
        },
        'content-state': {
          endsAt: at('2037-10-19T15:00:00Z'),
          // The next two blocks of any kind fill the segment bar.
          next: [
            {
              title: 'Review networking notes',
              startsAt: at('2037-10-19T15:00:00Z'),
              durationMin: 60,
            },
            { title: 'Lunch', startsAt: at('2037-10-19T16:00:00Z'), durationMin: 40 },
          ],
        },
        'stale-date': Date.UTC(2037, 9, 19, 15, 0) / 1000,
        alert: { title: 'Advanced Networking I', body: 'Until 11:00 am' },
      },
    });
    // ActivityKit counts from 2001-01-01, not 1970 (D-102).
    expect(appleDate(new Date('2001-01-01T00:00:00Z'))).toBe(0);
  });

  it('logs and skips without a push-to-start token', async () => {
    await put('/v1/devices/current', { live_activity_start_token: null });
    const [first] = await jobs('la.start');
    await handlers['la.start'](first!.payload_json);
    expect(sent).toHaveLength(0);
    expect(logs.some((l) => String(l.msg).includes('no push-to-start token'))).toBe(true);
    await put('/v1/devices/current', { live_activity_start_token: START_TOKEN });
  });
});

describe('activity reports and la.end', () => {
  let key: string;
  beforeAll(async () => {
    clock = new Date('2037-10-19T13:41:00Z');
    await handlers['la.schedule']({ user_id: OWNER.id, device_id: deviceId });
    const ends = await jobs('la.end');
    key = String(
      ends.find((j) => String(j.payload_json.block_key).endsWith('2037-10-19'))!.payload_json
        .block_key,
    );
  });

  it('rejects a malformed block key and an unknown block', async () => {
    expect(
      (await put('/v1/devices/current/activities/nope', { state: 'started' })).statusCode,
    ).toBe(400);
    const unknown = `00000000-0000-0000-0000-000000000000:2037-10-19`;
    expect(
      (await put(`/v1/devices/current/activities/${unknown}`, { state: 'started' })).statusCode,
    ).toBe(404);
  });

  it('without the activity token, la.end retries each minute, then leaves it to staleDate', async () => {
    const r = await put(`/v1/devices/current/activities/${key}`, { state: 'started' });
    expect(r.json()).toEqual({ block_key: key, state: 'started' });
    clock = new Date('2037-10-19T15:00:00Z');
    const p = { device_id: deviceId, user_id: OWNER.id, block_key: key, attempt: 0 };
    const services = createHandlers({ db: t.db, config: t.config, now, log: (o) => logs.push(o) });
    await services['la.end'](p);
    const retry = (await jobs('la.end')).find(
      (j) => j.payload_json.block_key === key && j.payload_json.attempt === 1,
    );
    expect(retry && new Date(retry.run_at).toISOString()).toBe('2037-10-19T15:01:00.000Z');
    clock = new Date('2037-10-19T15:05:00Z');
    await handlers['la.end']({ ...p, attempt: 4 });
    expect(sent).toHaveLength(0);
    expect((await activity(key))!.state).toBe('ended');
    expect(logs.some((l) => String(l.msg).includes('left to staleDate'))).toBe(true);
  });

  it('with the activity token, la.end pushes event end with dismissal-date = block end', async () => {
    const ends = await jobs('la.end');
    const next = String(
      ends.find((j) => new Date(j.run_at).toISOString() === '2037-10-19T16:00:00.000Z')!
        .payload_json.block_key,
    );
    clock = new Date('2037-10-19T15:05:00Z');
    await put(`/v1/devices/current/activities/${next}`, {
      state: 'started',
      push_token: ACTIVITY_TOKEN,
    });
    expect((await activity(next))!.push_token).toBe(ACTIVITY_TOKEN);
    clock = new Date('2037-10-19T16:00:00Z'); // Review ends at 12:00 pm
    await handlers['la.end']({
      device_id: deviceId,
      user_id: OWNER.id,
      block_key: next,
      attempt: 0,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.token).toBe(ACTIVITY_TOKEN);
    expect(sent[0]!.req.payload.aps).toMatchObject({
      event: 'end',
      'dismissal-date': Date.UTC(2037, 9, 19, 16, 0) / 1000,
      timestamp: Date.UTC(2037, 9, 19, 16, 0) / 1000,
    });
    expect((await activity(next))!.state).toBe('ended');
  });

  it('a dismissed activity is never started again', async () => {
    clock = new Date('2037-10-19T16:05:00Z');
    // Cryptography prep, 2:45 pm.
    const start = (await jobs('la.start')).find(
      (j) => new Date(j.run_at).toISOString() === '2037-10-19T18:45:00.000Z',
    );
    const k = String(start!.payload_json.block_key);
    await put(`/v1/devices/current/activities/${k}`, { state: 'dismissed' });
    expect((await jobs('la.start')).some((j) => j.payload_json.block_key === k)).toBe(false);
    await handlers['la.schedule']({ user_id: OWNER.id, device_id: deviceId });
    expect((await jobs('la.start')).some((j) => j.payload_json.block_key === k)).toBe(false);
    expect((await activity(k))!.state).toBe('dismissed');
  });
});

describe('Line only', () => {
  it('switching to Line only cancels pending starts and ends the activity showing now', async () => {
    clock = new Date('2037-10-19T17:15:00Z'); // 1:15 pm, inside Sermon Sync 12:40–2:30
    await handlers['la.schedule']({ user_id: OWNER.id, device_id: deviceId });
    const showing = String(
      (await jobs('la.end')).find(
        (j) => new Date(j.run_at).toISOString() === '2037-10-19T18:30:00.000Z',
      )!.payload_json.block_key,
    );
    await put(`/v1/devices/current/activities/${showing}`, {
      state: 'started',
      push_token: ACTIVITY_TOKEN,
    });
    expect((await jobs('la.start')).length).toBeGreaterThan(0);

    const r = await put('/v1/devices/current', { prefs: { lock_mode: 'line' } });
    expect(r.json().prefs).toMatchObject({ lock_mode: 'line', line_on: true });
    await handlers['la.schedule']({ user_id: OWNER.id, device_id: deviceId });

    expect(await jobs('la.start')).toHaveLength(0);
    const ends = await jobs('la.end');
    expect(ends).toHaveLength(1);
    expect(ends[0]!.payload_json).toMatchObject({
      block_key: showing,
      now: true,
      reason: 'line_only',
    });
    await handlers['la.end'](ends[0]!.payload_json);
    expect(sent.at(-1)!.req.payload.aps).toMatchObject({
      event: 'end',
      'dismissal-date': Date.UTC(2037, 9, 19, 17, 15) / 1000,
    });
    await put('/v1/devices/current', { prefs: { lock_mode: 'live' } });
  });
});

describe('triggers', () => {
  it('a schedule write queues la.schedule once for that revision; plans don’t', async () => {
    const { ChangeRecorder } = await import('../src/sync/record');
    // Inside a transaction that is rolled back: the check must not leave a change_log row behind.
    const seen = await t.db
      .transaction(async (tx) => {
        const rec = new ChangeRecorder(tx, OWNER.id);
        const rev = await rec.record('profile', OWNER.id, 'upsert', null);
        await rec.record('profile', OWNER.id, 'upsert', null);
        const q = await tx.execute<{ n: number }>(sql`select count(*)::int as n from jobs
          where kind = 'la.schedule' and dedupe_key = ${`la.schedule:${OWNER.id}:${rev}`}`);
        const planRec = new ChangeRecorder(tx, OWNER.id);
        const planRev = await planRec.record('plan', OWNER.id, 'upsert', null);
        const p = await tx.execute<{ n: number }>(sql`select count(*)::int as n from jobs
          where dedupe_key = ${`la.schedule:${OWNER.id}:${planRev}`}`);
        throw Object.assign(new Error('rollback'), { counts: [q.rows[0]!.n, p.rows[0]!.n] });
      })
      .catch((e: { counts?: number[] }) => e.counts);
    expect(seen).toEqual([1, 0]);
  });

  it('nightly: one la.schedule per user at 03:00 local, not at other times', async () => {
    await t.db.execute(sql`delete from jobs where dedupe_key like ${`la.nightly:${OWNER.id}:%`}`);
    expect(await enqueueNightly(t.db, new Date('2037-10-20T05:00:00Z'))).toBe(0); // 1:00 am
    const at3 = new Date('2037-10-20T07:02:00Z'); // 3:02 am EDT
    expect(await enqueueNightly(t.db, at3)).toBeGreaterThanOrEqual(1);
    await enqueueNightly(t.db, new Date('2037-10-20T07:10:00Z'));
    const q = await t.db.execute<{ n: number }>(sql`select count(*)::int as n from jobs
      where dedupe_key = ${`la.nightly:${OWNER.id}:2037-10-20`}`);
    expect(q.rows[0]!.n).toBe(1);
  });
});
