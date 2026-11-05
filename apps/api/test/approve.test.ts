import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, OWNER, TEST_NOW, type TestApp } from './helpers';
import { approvePlan, discardPlan } from '../src/plans/approve';
import { AppError } from '../src/lib/errors';
import type { IsoDate } from '@dialed/schedule';

const WELLSERVICES_WED = '50c05f16-23bd-5fe1-b748-148243e8611a';
const SPEEDWATCH_FRI = '4785aeda-e8f8-5873-8ff4-6b01e0fad168';
const BOB_PLAN = '3f64b5e1-eed2-5e8e-9db2-a6499a142fc6';

const TODAY: IsoDate = '2037-10-20';

let t: TestApp;
const planIds: string[] = [];

beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  await t.db.execute(sql`delete from change_log where user_id = ${OWNER.id}`);
  await t.db.execute(sql`update revisions set revision = 0 where user_id = ${OWNER.id}`);
});
afterEach(async () => {
  for (const id of planIds) {
    await t.db.execute(sql`delete from plan_changes where plan_id = ${id}`);
    await t.db.execute(sql`delete from plans where id = ${id}`);
  }
  planIds.length = 0;
  await t.db.execute(
    sql`delete from routine_blocks where source = 'plan' and user_id = ${OWNER.id}`,
  );
  await t.db.execute(sql`delete from overrides where source = 'plan' and user_id = ${OWNER.id}`);
  await t.db.execute(
    sql`delete from categories where user_id = ${OWNER.id} and name = 'Bible study'`,
  );
  await t.db.execute(sql`delete from change_log where user_id = ${OWNER.id} and revision > 0`);
  await t.db.execute(sql`delete from audit_log where action in ('approve', 'discard')`);
  await t.db.execute(sql`update revisions set revision = 0 where user_id = ${OWNER.id}`);
  await t.db.execute(
    sql`update routine_blocks set effective_to = null where id in (${WELLSERVICES_WED}, ${SPEEDWATCH_FRI})`,
  );
});
afterAll(async () => {
  await t.close();
});

async function seedPlan(userId: string, opts: { status?: string; baseRevision?: number } = {}) {
  const planId = randomUUID();
  planIds.push(planId);
  const status = opts.status ?? 'ready';
  const baseRevision = opts.baseRevision ?? 0;
  await t.db.execute(sql`insert into plans
    (id, user_id, source, provider, request_text, status, base_revision, version, range_from, range_to)
    values (${planId}, ${userId}, 'in_app', 'fixture',
      'Bible study with Chichi every Wednesday at 7, for the rest of the year. And move Friday Speedwatch to Saturday evening.',
      ${status}, ${baseRevision}, 1, '2037-10-21', '2037-12-31')`);

  const changes = [
    {
      ord: 0,
      kind: 'create_category',
      title: 'Bible study',
      payload: {
        new_category: { temp_id: 'c1', name: 'Bible study', group: 'Life', palette: 'Mint' },
      },
    },
    {
      ord: 1,
      kind: 'new',
      title: 'Bible study with Chichi',
      payload: {
        category_id: 'c1',
        repeat: { weekday: 'wed', from: '2037-10-21', until: '2037-12-31' },
        start: '19:00',
        end: '20:30',
      },
    },
    {
      ord: 2,
      kind: 'moved',
      title: 'WellServices',
      payload: {
        block_ref: WELLSERVICES_WED,
        repeat: { weekday: 'sun', from: '2037-10-25', until: '2037-12-11' },
        to_weekday: 'sun',
        start: '15:00',
        end: '16:45',
        close_from: '2037-10-21',
      },
    },
    {
      ord: 3,
      kind: 'moved',
      title: 'Speedwatch Ontario',
      payload: {
        block_ref: SPEEDWATCH_FRI,
        repeat: { weekday: 'sat', from: '2037-10-24', until: '2037-12-11' },
        to_weekday: 'sat',
        start: '17:30',
        end: '18:45',
        close_from: '2037-10-23',
      },
    },
  ];

  for (const c of changes) {
    await t.db.execute(sql`insert into plan_changes
      (id, plan_id, ord, kind, title, payload_json, note, enabled)
      values (${randomUUID()}, ${planId}, ${c.ord}, ${c.kind}, ${c.title},
        ${JSON.stringify(c.payload)}::jsonb, '', true)`);
  }
  return planId;
}

function expectAppError(err: unknown, code: string) {
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
}

describe('approvePlan', () => {
  it('approves bible-study: creates category, blocks, moves — all in one revision', async () => {
    const planId = await seedPlan(OWNER.id);
    const result = await approvePlan(t.db, OWNER.id, planId, 1, TODAY);

    expect(result.revision).toBeGreaterThan(0);
    expect(result.applied.length).toBeGreaterThan(0);

    const {
      rows: [plan],
    } = await t.db.execute(sql`select status from plans where id = ${planId}`);
    expect(plan!.status).toBe('approved');

    const { rows: cats } = await t.db.execute(
      sql`select * from categories where user_id = ${OWNER.id} and name = 'Bible study'`,
    );
    expect(cats).toHaveLength(1);
    expect(cats[0]!.group_name).toBe('Life');

    const { rows: newBlocks } = await t.db.execute(
      sql`select * from routine_blocks where user_id = ${OWNER.id} and source = 'plan'`,
    );
    expect(newBlocks.length).toBeGreaterThan(0);
    const bibleBlocks = newBlocks.filter(
      (b: Record<string, unknown>) => b.title === 'Bible study with Chichi',
    );
    expect(bibleBlocks.length).toBeGreaterThan(0);

    const {
      rows: [wellClosed],
    } = await t.db.execute(
      sql`select effective_to from routine_blocks where id = ${WELLSERVICES_WED}`,
    );
    expect(wellClosed!.effective_to).toBeTruthy();

    const {
      rows: [speedClosed],
    } = await t.db.execute(
      sql`select effective_to from routine_blocks where id = ${SPEEDWATCH_FRI}`,
    );
    expect(speedClosed!.effective_to).toBeTruthy();

    const { rows: logRows } = await t.db.execute(
      sql`select distinct revision from change_log where user_id = ${OWNER.id} and revision = ${result.revision}`,
    );
    expect(logRows).toHaveLength(1);

    const { rows: audit } = await t.db.execute(
      sql`select * from audit_log where target = ${planId} and action = 'approve'`,
    );
    expect(audit).toHaveLength(1);
  });

  it('approving twice is idempotent — returns the same revision', async () => {
    const planId = await seedPlan(OWNER.id);
    const first = await approvePlan(t.db, OWNER.id, planId, 1, TODAY);
    const second = await approvePlan(t.db, OWNER.id, planId, 2, TODAY);
    expect(second.revision).toBe(first.revision);
    expect(second.applied).toEqual([]);
  });

  it('plan_not_ready for drafting plan', async () => {
    const planId = await seedPlan(OWNER.id, { status: 'drafting' });
    try {
      await approvePlan(t.db, OWNER.id, planId, 1, TODAY);
      expect.unreachable('should throw');
    } catch (err) {
      expectAppError(err, 'plan_not_ready');
    }
  });

  it('plan_changed when version mismatch', async () => {
    const planId = await seedPlan(OWNER.id);
    try {
      await approvePlan(t.db, OWNER.id, planId, 99, TODAY);
      expect.unreachable('should throw');
    } catch (err) {
      expectAppError(err, 'plan_changed');
    }
  });

  it('plan_stale when schedule changed after base revision', async () => {
    const planId = await seedPlan(OWNER.id, { baseRevision: 0 });
    await t.db.execute(sql`insert into change_log (user_id, revision, entity, entity_id, op)
      values (${OWNER.id}, 1, 'routine_block', ${randomUUID()}, 'upsert')`);

    try {
      await approvePlan(t.db, OWNER.id, planId, 1, TODAY);
      expect.unreachable('should throw');
    } catch (err) {
      expectAppError(err, 'plan_stale');
    }

    const {
      rows: [plan],
    } = await t.db.execute(sql`select status from plans where id = ${planId}`);
    expect(plan!.status).toBe('stale');
  });

  it("Bob's plan → not_found for Owner", async () => {
    try {
      await approvePlan(t.db, OWNER.id, BOB_PLAN, 1, TODAY);
      expect.unreachable('should throw');
    } catch (err) {
      expectAppError(err, 'not_found');
    }
  });

  it('non-existent plan → not_found', async () => {
    try {
      await approvePlan(t.db, OWNER.id, randomUUID(), 1, TODAY);
      expect.unreachable('should throw');
    } catch (err) {
      expectAppError(err, 'not_found');
    }
  });
});

describe('discardPlan', () => {
  it('discards a ready plan', async () => {
    const planId = await seedPlan(OWNER.id);
    await discardPlan(t.db, OWNER.id, planId);
    const {
      rows: [plan],
    } = await t.db.execute(sql`select status from plans where id = ${planId}`);
    expect(plan!.status).toBe('discarded');
  });

  it('discarding twice is idempotent', async () => {
    const planId = await seedPlan(OWNER.id);
    await discardPlan(t.db, OWNER.id, planId);
    await discardPlan(t.db, OWNER.id, planId);
  });

  it('cannot discard an approved plan', async () => {
    const planId = await seedPlan(OWNER.id);
    await approvePlan(t.db, OWNER.id, planId, 1, TODAY);
    try {
      await discardPlan(t.db, OWNER.id, planId);
      expect.unreachable('should throw');
    } catch (err) {
      expectAppError(err, 'bad_request');
    }
  });
});
