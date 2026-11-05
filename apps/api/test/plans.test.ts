import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { login, makeApp, OWNER, BOB, type TestApp, TEST_NOW } from './helpers';

let t: TestApp;
let owner: Awaited<ReturnType<typeof login>>;
let bob: Awaited<ReturnType<typeof login>>;
beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  owner = await login(t, OWNER.email);
  bob = await login(t, BOB.email);
});
afterAll(async () => {
  await cleanup();
  await t.close();
});

const auth = (s: { access_token: string }) => ({ authorization: `Bearer ${s.access_token}` });

const send = (s: { access_token: string }, body: object) =>
  t.app.inject({ method: 'POST', url: '/v1/plans', headers: auth(s), payload: body });

const get = (s: { access_token: string }, id: string) =>
  t.app.inject({ method: 'GET', url: `/v1/plans/${id}`, headers: auth(s) });

const list = (s: { access_token: string }) =>
  t.app.inject({ method: 'GET', url: '/v1/plans', headers: auth(s) });

const answer = (s: { access_token: string }, id: string, option: string) =>
  t.app.inject({
    method: 'POST',
    url: `/v1/plans/${id}/answer`,
    headers: auth(s),
    payload: { option },
  });

const reply = (s: { access_token: string }, id: string, text: string) =>
  t.app.inject({
    method: 'POST',
    url: `/v1/plans/${id}/reply`,
    headers: auth(s),
    payload: { text },
  });

const cancel = (s: { access_token: string }, id: string) =>
  t.app.inject({ method: 'POST', url: `/v1/plans/${id}/cancel`, headers: auth(s) });

async function waitFor(
  s: { access_token: string },
  planId: string,
  statuses: string[],
  maxMs = 3000,
) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const r = await get(s, planId);
    const body = r.json();
    if (statuses.includes(body.status)) return body;
    await new Promise((r) => setTimeout(r, 30));
  }
  const last = (await get(s, planId)).json();
  throw new Error(
    `Plan ${planId} status=${last.status} error_code=${last.error_code}, expected ${statuses.join('|')}`,
  );
}

async function cleanup() {
  await t.db.execute(
    sql`delete from plan_changes where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(
    sql`delete from plan_messages where plan_id in (select id from plans where user_id = ${OWNER.id})`,
  );
  await t.db.execute(sql`delete from plans where user_id = ${OWNER.id}`);
  await t.db.execute(sql`delete from usage_counters where user_id = ${OWNER.id}`);
}

const BIBLE_STUDY_TEXT =
  'Bible study with Chichi every Wednesday at 7, for the rest of the year. And move Friday Speedwatch to Saturday evening.';
const QUESTION_TEXT = 'Add bible study with Chichi on Wednesdays';
const FAILURE_TEXT = 'Plan anything for me';
const OVERLAPPING_TEXT = 'Add a morning run that overlaps with class';

describe('POST /v1/plans', () => {
  it('send → ready using bible-study', async () => {
    await cleanup();
    const r = await send(owner, {
      source: 'in_app',
      request_text: BIBLE_STUDY_TEXT,
      provider_mode: 'server',
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();
    expect(body.status).toBe('drafting');

    const done = await waitFor(owner, body.id, ['ready']);
    expect(done.status).toBe('ready');
    expect(done.changes.length).toBeGreaterThan(0);
    expect(done.version).toBeGreaterThan(1);
    await cleanup();
  });

  it('question → answer → ready', async () => {
    await cleanup();
    const r = await send(owner, {
      source: 'in_app',
      request_text: QUESTION_TEXT,
      provider_mode: 'server',
    });
    expect(r.statusCode).toBe(201);
    const body = r.json();

    const q = await waitFor(owner, body.id, ['question']);
    expect(q.status).toBe('question');
    expect(q.messages.length).toBeGreaterThanOrEqual(1);
    const qMsg = q.messages.find((m: { role: string }) => m.role === 'question');
    expect(qMsg).toBeDefined();

    const ar = await answer(owner, body.id, qMsg.options[0]);
    expect(ar.statusCode).toBe(200);

    const ready = await waitFor(owner, body.id, ['ready']);
    expect(ready.status).toBe('ready');
    expect(ready.changes.length).toBeGreaterThan(0);
    await cleanup();
  });

  it('reply revises the plan', async () => {
    await cleanup();
    const r = await send(owner, {
      source: 'in_app',
      request_text: BIBLE_STUDY_TEXT,
      provider_mode: 'server',
    });
    const { id } = r.json();
    await waitFor(owner, id, ['ready']);

    const rr = await reply(owner, id, 'Actually make it 8 AM not 7');
    expect(rr.statusCode).toBe(200);
    const body = rr.json();
    expect(body.status).toBe('drafting');

    const revised = await waitFor(owner, id, ['ready']);
    expect(revised.status).toBe('ready');
    expect(revised.version).toBeGreaterThan(body.version);
    expect(revised.messages.some((m: { role: string }) => m.role === 'reply')).toBe(true);
    await cleanup();
  });

  it('failure.json → failed with provider_error', async () => {
    await cleanup();
    const r = await send(owner, {
      source: 'in_app',
      request_text: FAILURE_TEXT,
      provider_mode: 'server',
    });
    expect(r.statusCode).toBe(201);

    const done = await waitFor(owner, r.json().id, ['failed']);
    expect(done.status).toBe('failed');
    expect(done.error_code).toBe('provider_error');
    await cleanup();
  });

  it('validation-exhausted → failed with validation_failed', async () => {
    await cleanup();
    const r = await send(owner, {
      source: 'in_app',
      request_text: OVERLAPPING_TEXT,
      provider_mode: 'server',
    });
    expect(r.statusCode).toBe(201);

    const done = await waitFor(owner, r.json().id, ['failed']);
    expect(done.status).toBe('failed');
    expect(done.error_code).toBe('validation_failed');
    await cleanup();
  });

  it('31st plan → daily_limit', async () => {
    await cleanup();
    await t.db
      .execute(sql`insert into usage_counters (user_id, day, plan_runs, tokens_in, tokens_out)
      values (${OWNER.id}, '2037-10-20', 30, 0, 0)
      on conflict (user_id, day) do update set plan_runs = 30`);

    const r = await send(owner, {
      source: 'in_app',
      request_text: BIBLE_STUDY_TEXT,
      provider_mode: 'server',
    });
    expect(r.statusCode).toBe(429);
    expect(r.json().error.code).toBe('daily_limit');
    await cleanup();
  });

  it('cancel a drafting plan', async () => {
    await cleanup();
    const r = await send(owner, {
      source: 'in_app',
      request_text: BIBLE_STUDY_TEXT,
      provider_mode: 'server',
    });
    const { id } = r.json();

    const cr = await cancel(owner, id);
    expect(cr.statusCode).toBe(204);

    const done = await get(owner, id);
    expect(done.json().status).toBe('cancelled');
    await cleanup();
  });

  it('one drafting plan per user — new send cancels the old', async () => {
    await cleanup();
    const r1 = await send(owner, {
      source: 'in_app',
      request_text: BIBLE_STUDY_TEXT,
      provider_mode: 'server',
    });
    const id1 = r1.json().id;

    const r2 = await send(owner, {
      source: 'in_app',
      request_text: QUESTION_TEXT,
      provider_mode: 'server',
    });
    expect(r2.statusCode).toBe(201);

    const old = await get(owner, id1);
    expect(['cancelled', 'ready', 'failed']).toContain(old.json().status);
    await cleanup();
  });

  it('idempotency key returns the same plan', async () => {
    await cleanup();
    const r1 = await t.app.inject({
      method: 'POST',
      url: '/v1/plans',
      headers: { ...auth(owner), 'idempotency-key': 'test-key-1' },
      payload: { source: 'in_app', request_text: BIBLE_STUDY_TEXT, provider_mode: 'server' },
    });
    expect(r1.statusCode).toBe(201);
    const id1 = r1.json().id;

    const r2 = await t.app.inject({
      method: 'POST',
      url: '/v1/plans',
      headers: { ...auth(owner), 'idempotency-key': 'test-key-1' },
      payload: { source: 'in_app', request_text: BIBLE_STUDY_TEXT, provider_mode: 'server' },
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json().id).toBe(id1);
    await cleanup();
  });

  it('"thanks!" → ready with no changes', async () => {
    await cleanup();
    const r = await send(owner, {
      source: 'in_app',
      request_text: 'thanks!',
      provider_mode: 'server',
    });
    expect(r.statusCode).toBe(201);

    const done = await waitFor(owner, r.json().id, ['ready']);
    expect(done.status).toBe('ready');
    expect(done.changes.length).toBe(0);
    await cleanup();
  });
});

describe('GET /v1/plans', () => {
  it('lists plans for the owner', async () => {
    await cleanup();
    const r1 = await send(owner, {
      source: 'in_app',
      request_text: BIBLE_STUDY_TEXT,
      provider_mode: 'server',
    });
    await waitFor(owner, r1.json().id, ['ready']);

    const lr = await list(owner);
    expect(lr.statusCode).toBe(200);
    const body = lr.json();
    expect(body.plans.length).toBeGreaterThanOrEqual(1);
    expect(body.plans[0].id).toBe(r1.json().id);
    await cleanup();
  });
});

describe('access control', () => {
  it("Bob cannot see the owner's plan", async () => {
    await cleanup();
    const r = await send(owner, {
      source: 'in_app',
      request_text: BIBLE_STUDY_TEXT,
      provider_mode: 'server',
    });
    const { id } = r.json();

    const br = await get(bob, id);
    expect(br.statusCode).toBe(404);
    await cleanup();
  });

  it('401 without a token', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/v1/plans' });
    expect(r.statusCode).toBe(401);
  });
});
