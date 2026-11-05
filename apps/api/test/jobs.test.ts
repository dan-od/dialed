import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { login, makeApp, OWNER, type TestApp, TEST_NOW } from './helpers';
import { enqueue } from '../src/jobs/enqueue';
import { createHandlers, isInQuietHours, minutesUntilQuietEnd } from '../src/jobs/handlers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof login>>;
const logs: Record<string, unknown>[] = [];

beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  owner = await login(t, OWNER.email);
});
afterAll(async () => {
  await t.db.execute(
    sql`delete from jobs where kind in ('plan.retry','push.plan_ready','plans.sweep','test.job')`,
  );
  await t.db.execute(
    sql`delete from plan_changes where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(
    sql`delete from plan_messages where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(sql`delete from plans where user_id = ${OWNER.id}`);
  await t.db.execute(sql`delete from usage_counters where user_id = ${OWNER.id}`);
  await t.close();
});
beforeEach(() => {
  logs.length = 0;
});

async function waitFor(fn: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error('waitFor timed out');
}

describe('enqueue', () => {
  it('inserts a job and returns its id', async () => {
    const id = await enqueue(t.db, 'test.job', { foo: 1 });
    expect(id).toBeTypeOf('number');

    const { rows } = await t.db.execute<Record<string, unknown>>(
      sql`select kind, payload_json, status from jobs where id = ${id!}`,
    );
    expect(rows[0]!.kind).toBe('test.job');
    expect(rows[0]!.status).toBe('queued');
  });

  it('deduplicates on dedupe_key', async () => {
    const id1 = await enqueue(t.db, 'test.job', { n: 1 }, { dedupeKey: 'dedup-test-1' });
    const id2 = await enqueue(t.db, 'test.job', { n: 2 }, { dedupeKey: 'dedup-test-1' });
    expect(id1).toBeTypeOf('number');
    expect(id2).toBeNull();
  });

  it('schedules with runAt', async () => {
    const future = new Date('2030-06-15T12:00:00Z');
    const id = await enqueue(t.db, 'test.job', {}, { runAt: future });
    const { rows } = await t.db.execute<Record<string, unknown>>(
      sql`select run_at from jobs where id = ${id!}`,
    );
    expect(new Date(rows[0]!.run_at as string).getFullYear()).toBe(2030);
  });
});

describe('isInQuietHours', () => {
  it('returns false when start === end (disabled)', () => {
    expect(isInQuietHours(120, 0, 0)).toBe(false);
  });

  it('handles non-wrapping range (0–540)', () => {
    expect(isInQuietHours(300, 0, 540)).toBe(true);
    expect(isInQuietHours(600, 0, 540)).toBe(false);
  });

  it('handles wrapping range (1380–360 = 11pm–6am)', () => {
    expect(isInQuietHours(0, 1380, 360)).toBe(true);
    expect(isInQuietHours(1400, 1380, 360)).toBe(true);
    expect(isInQuietHours(600, 1380, 360)).toBe(false);
  });
});

describe('minutesUntilQuietEnd', () => {
  it('simple case', () => {
    expect(minutesUntilQuietEnd(300, 540)).toBe(240);
  });

  it('wrapping past midnight', () => {
    expect(minutesUntilQuietEnd(1400, 360)).toBe(400);
  });
});

describe('push.plan_ready handler', () => {
  it('logs PLAN_READY with APNS_MODE=log and paid tier', async () => {
    const handlers = createHandlers({
      db: t.db,
      config: { ...t.config, APPLE_TEAM_TIER: 'paid', APNS_MODE: 'log' },
      now: TEST_NOW,
      log: (obj) => logs.push(obj),
    });

    // insert a device with apns_token for OWNER
    await t.db.execute(sql`
      insert into devices (id, user_id, platform, apns_token)
      values ('d0000000-0000-0000-0000-0000000000a1', ${OWNER.id}, 'ios', 'fake-apns-token')
      on conflict (id) do update set apns_token = 'fake-apns-token'`);

    const planId = 'a0000000-0000-0000-0000-0000000000b1';
    await handlers['push.plan_ready']({ plan_id: planId, user_id: OWNER.id });

    expect(logs).toHaveLength(1);
    expect(logs[0]!.msg).toBe('PLAN_READY');
    expect(logs[0]!.url).toBe(`dialed://plan/${planId}`);
  });

  it('skips push on personal tier', async () => {
    const handlers = createHandlers({
      db: t.db,
      config: { ...t.config, APPLE_TEAM_TIER: 'personal' },
      now: TEST_NOW,
      log: (obj) => logs.push(obj),
    });

    await handlers['push.plan_ready']({ plan_id: 'some-plan', user_id: OWNER.id });
    expect(logs[0]!.msg).toBe('personal tier — push skipped');
  });

  it('defers during quiet hours', async () => {
    // OWNER seed: quiet_start_min=0, quiet_end_min=450 (midnight–7:30am).
    // Set now to 3am ET (minute 180) — inside quiet hours.
    const threeAm = () => new Date('2026-10-20T07:00:00Z'); // 3am ET

    const handlers = createHandlers({
      db: t.db,
      config: { ...t.config, APPLE_TEAM_TIER: 'paid', APNS_MODE: 'log' },
      now: threeAm,
      log: (obj) => logs.push(obj),
    });

    await handlers['push.plan_ready']({
      plan_id: 'b0000000-0000-0000-0000-0000000000c1',
      user_id: OWNER.id,
    });
    expect(logs[0]!.msg).toBe('deferred to quiet-hours end');
    expect(logs[0]!.deferMinutes).toBe(270); // 450 - 180
  });
});

describe('plans.sweep handler', () => {
  it('marks stale drafting plans as failed', async () => {
    // Insert a plan stuck in drafting from 5 min ago
    const fiveMinAgo = new Date(TEST_NOW().getTime() - 5 * 60_000);
    const planId = 'a0000000-0000-0000-0000-000000000001';
    await t.db.execute(sql`
      insert into plans (id, user_id, source, provider, request_text, status, base_revision, created_at)
      values (${planId}, ${OWNER.id}, 'in_app', 'fixture', 'test sweep', 'drafting', 0, ${fiveMinAgo.toISOString()}::timestamptz)
      on conflict (id) do update set status = 'drafting', created_at = ${fiveMinAgo.toISOString()}::timestamptz`);

    const handlers = createHandlers({
      db: t.db,
      config: t.config,
      now: TEST_NOW,
      log: (obj) => logs.push(obj),
    });

    await handlers['plans.sweep']({});

    const {
      rows: [plan],
    } = await t.db.execute<Record<string, unknown>>(
      sql`select status, error_code from plans where id = ${planId}`,
    );
    expect(plan!.status).toBe('failed');
    expect(plan!.error_code).toBe('timeout');
    expect(logs[0]!.msg).toContain('swept 1');
  });

  it('does not sweep recent drafting plans', async () => {
    const planId = 'a0000000-0000-0000-0000-000000000002';
    const recent = new Date(TEST_NOW().getTime() - 30_000); // 30s ago
    await t.db.execute(sql`
      insert into plans (id, user_id, source, provider, request_text, status, base_revision, created_at)
      values (${planId}, ${OWNER.id}, 'in_app', 'fixture', 'test sweep recent', 'drafting', 0, ${recent.toISOString()}::timestamptz)
      on conflict (id) do update set status = 'drafting', created_at = ${recent.toISOString()}::timestamptz`);

    const handlers = createHandlers({
      db: t.db,
      config: t.config,
      now: TEST_NOW,
      log: (obj) => logs.push(obj),
    });

    await handlers['plans.sweep']({});

    const {
      rows: [plan],
    } = await t.db.execute<Record<string, unknown>>(
      sql`select status from plans where id = ${planId}`,
    );
    expect(plan!.status).toBe('drafting');
  });
});
