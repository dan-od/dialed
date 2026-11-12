// Flow 06 background retry (plans/flow-06-retry.md): after the third attempt fails on a network problem the
// server tries once more 10 minutes later, and the plan says whether that try is queued or done.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { login, makeApp, OWNER, type TestApp, TEST_NOW } from './helpers';
import { createHandlers } from '../src/jobs/handlers';
import { queueBackgroundRetry, BG_RETRY_DELAY_MS } from '../src/plans/background-retry';

type Row = Record<string, unknown>;
let t: TestApp;
let owner: Awaited<ReturnType<typeof login>>;
const logs: Row[] = [];

const FAILURE_TEXT = 'Plan anything for me';
const OVERLAPPING_TEXT = 'Add a morning run that overlaps with class';
const BIBLE_STUDY_TEXT =
  'Bible study with Chichi every Wednesday at 7, for the rest of the year. And move Friday Speedwatch to Saturday evening.';

beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  owner = await login(t, OWNER.email);
});
afterAll(async () => {
  await cleanup();
  await t.close();
});
beforeEach(async () => {
  logs.length = 0;
  await cleanup();
});

async function cleanup() {
  await t.db.execute(sql`delete from jobs where kind in ('plan.retry','push.plan_ready')`);
  await t.db.execute(
    sql`delete from plan_changes where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(
    sql`delete from plan_messages where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(sql`delete from plans where user_id = ${OWNER.id}`);
  await t.db.execute(sql`delete from usage_counters where user_id = ${OWNER.id}`);
}

const auth = () => ({ authorization: `Bearer ${owner.access_token}` });
const get = async (id: string) =>
  (await t.app.inject({ method: 'GET', url: `/v1/plans/${id}`, headers: auth() })).json();

async function waitFor(id: string, statuses: string[], maxMs = 3000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const body = await get(id);
    if (statuses.includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error(`plan ${id} never reached ${statuses.join('|')}`);
}

async function retryJobs(planId: string) {
  const { rows } = await t.db.execute<Row>(
    sql`select status, run_at from jobs where kind = 'plan.retry' and payload_json->>'plan_id' = ${planId}`,
  );
  return rows;
}

/** Sends a request and redoes it until it has failed `runs` times. */
async function failRuns(text: string, runs: number): Promise<string> {
  const r = await t.app.inject({
    method: 'POST',
    url: '/v1/plans',
    headers: auth(),
    payload: { source: 'in_app', request_text: text, provider_mode: 'server' },
  });
  const id = r.json().id as string;
  await waitFor(id, ['failed']);
  for (let i = 1; i < runs; i++) {
    const redo = await t.app.inject({
      method: 'POST',
      url: `/v1/plans/${id}/redo`,
      headers: auth(),
    });
    expect(redo.statusCode).toBe(200);
    await waitFor(id, ['failed']);
  }
  return id;
}

async function insertPlan(over: {
  status?: string;
  attempts?: number;
  error_code?: string | null;
  provider_mode?: string;
  request_text?: string;
  bg_retry_at?: Date | null;
}) {
  const id = randomUUID();
  await t.db.execute(sql`insert into plans
    (id, user_id, source, provider, request_text, status, base_revision, attempts, error_code, provider_mode, bg_retry_at)
    values (${id}, ${OWNER.id}, 'in_app', 'fixture', ${over.request_text ?? FAILURE_TEXT},
      ${over.status ?? 'failed'}, 0, ${over.attempts ?? 2}, ${over.error_code === undefined ? 'provider_error' : over.error_code},
      ${over.provider_mode ?? 'server'}, ${over.bg_retry_at ? over.bg_retry_at.toISOString() : null}::timestamptz)`);
  return id;
}

const handlers = () =>
  createHandlers({ db: t.db, config: t.config, now: TEST_NOW, log: (o) => logs.push(o) });

/** What the worker does after a handler returns. */
const markDone = (planId: string) =>
  t.db.execute(
    sql`update jobs set status = 'done' where kind = 'plan.retry' and payload_json->>'plan_id' = ${planId}`,
  );

describe('queueing the background retry', () => {
  it('queues one retry 10 minutes out after the third network failure, not before', async () => {
    const id = await failRuns(FAILURE_TEXT, 2);
    expect(await retryJobs(id)).toHaveLength(0);
    expect((await get(id)).background_retry).toBeNull();

    const redo = await t.app.inject({
      method: 'POST',
      url: `/v1/plans/${id}/redo`,
      headers: auth(),
    });
    expect(redo.statusCode).toBe(200);
    const failed = await waitFor(id, ['failed']);
    expect(failed.attempts).toBe(2);

    const jobs = await retryJobs(id);
    expect(jobs).toHaveLength(1);
    expect(new Date(String(jobs[0]!.run_at)).getTime()).toBe(
      TEST_NOW().getTime() + BG_RETRY_DELAY_MS,
    );
    expect(failed.background_retry).toBe('queued');

    const list = (await t.app.inject({ method: 'GET', url: '/v1/plans', headers: auth() })).json();
    expect(list.plans.find((p: Row) => p.id === id).background_retry).toBe('queued');
  });

  it('does not queue when the third attempt failed the rules', async () => {
    const id = await failRuns(OVERLAPPING_TEXT, 3);
    expect((await get(id)).error_code).toBe('validation_failed');
    expect(await retryJobs(id)).toHaveLength(0);
    expect((await get(id)).background_retry).toBeNull();
  });

  it('skips own-key plans, earlier attempts, non-network codes and plans already retried', async () => {
    const cases = [
      await insertPlan({ provider_mode: 'byo' }),
      await insertPlan({ attempts: 1 }),
      await insertPlan({ error_code: 'provider_key_invalid' }),
      await insertPlan({ error_code: 'daily_limit' }),
      await insertPlan({ status: 'cancelled', error_code: null }),
      await insertPlan({ bg_retry_at: TEST_NOW() }),
    ];
    for (const id of cases) {
      expect(await queueBackgroundRetry(t.db, id, TEST_NOW)).toBe(false);
      expect(await retryJobs(id)).toHaveLength(0);
    }
    for (const code of ['provider_error', 'server_error', 'timeout']) {
      const id = await insertPlan({ error_code: code });
      expect(await queueBackgroundRetry(t.db, id, TEST_NOW)).toBe(true);
      expect(await queueBackgroundRetry(t.db, id, TEST_NOW)).toBe(false);
      expect(await retryJobs(id)).toHaveLength(1);
    }
  });
});

describe('plan.retry handler', () => {
  it('drafts again; a ready plan queues push.plan_ready and reads as done', async () => {
    const id = await insertPlan({ request_text: BIBLE_STUDY_TEXT });
    await queueBackgroundRetry(t.db, id, TEST_NOW);
    await handlers()['plan.retry']({ plan_id: id, user_id: OWNER.id });
    await markDone(id);

    const plan = await get(id);
    expect(plan.status).toBe('ready');
    expect(plan.changes.length).toBeGreaterThan(0);
    expect(plan.background_retry).toBe('done');
    const { rows: push } = await t.db.execute<Row>(
      sql`select 1 from jobs where kind = 'push.plan_ready' and payload_json->>'plan_id' = ${id}`,
    );
    expect(push).toHaveLength(1);
  });

  it('tries only once: failing again leaves it failed, done, and queues nothing new', async () => {
    const id = await insertPlan({});
    await queueBackgroundRetry(t.db, id, TEST_NOW);
    await handlers()['plan.retry']({ plan_id: id, user_id: OWNER.id });
    await markDone(id);

    const plan = await get(id);
    expect(plan.status).toBe('failed');
    expect(plan.error_code).toBe('provider_error');
    expect(plan.background_retry).toBe('done');
    expect(await retryJobs(id)).toHaveLength(1);
  });

  it('does nothing when the plan changed since (not failed, or not on its last attempt)', async () => {
    for (const over of [{ status: 'cancelled' }, { status: 'ready' }, { attempts: 1 }]) {
      const id = await insertPlan({ ...over, bg_retry_at: TEST_NOW() });
      await handlers()['plan.retry']({ plan_id: id, user_id: OWNER.id });
      const {
        rows: [row],
      } = await t.db.execute<Row>(sql`select status, step from plans where id = ${id}`);
      expect(row!.status).toBe(over.status ?? 'failed');
      expect(Number(row!.step)).toBe(0);
    }
  });

  it('does nothing for an own-key plan', async () => {
    const id = await insertPlan({ provider_mode: 'byo', bg_retry_at: TEST_NOW() });
    await handlers()['plan.retry']({ plan_id: id, user_id: OWNER.id });
    const {
      rows: [row],
    } = await t.db.execute<Row>(sql`select status, step from plans where id = ${id}`);
    expect(row!.status).toBe('failed');
    expect(Number(row!.step)).toBe(0);
  });
});
