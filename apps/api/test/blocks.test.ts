import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALICE, BOB, BOB_PROBE_BLOCK, login, makeApp, TEST_NOW, type TestApp } from './helpers';

// Flow 04 server rules (sync push). Clock: Tue 2026-10-20 12:00 Toronto. Writes use Alice's seeded account so the
// owner's seed (golden for other suites) stays untouched.
const FALL_ROUTINE = '60eec3ef-59af-52e0-b13f-6826bd08e994';
const STUDY = '64251711-ded6-5b6f-ad18-bc84900fc568';
const SERMON = '4cab5eda-de35-5927-b0cc-54bd5dadabf3';
const BOB_ROUTINE = '6e8dea33-4e16-5b05-8fed-62fa306b2576';
const BOB_GYM = '0f1c2cef-0f68-53db-9e68-363d31054af5';
const MON_SERMON = '49c6f0b1-0217-5da4-b3a0-32031ffad086'; // Alice's probe block

let t: TestApp;
let owner: Awaited<ReturnType<typeof login>>;
let alice: Awaited<ReturnType<typeof login>>;
let bob: Awaited<ReturnType<typeof login>>;
beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  alice = await login(t, ALICE.email);
  owner = alice; // the writer in this suite
  bob = await login(t, BOB.email);
});
afterAll(async () => {
  await t.close();
});

const push = async (s: { access_token: string }, mutations: object[]) => {
  const r = await t.app.inject({
    method: 'POST',
    url: '/v1/sync/push',
    headers: { authorization: `Bearer ${s.access_token}` },
    payload: { mutations },
  });
  return { status: r.statusCode, body: r.json() };
};
const one = async (s: { access_token: string }, m: object) => (await push(s, [m])).body.results[0];
const newBlock = (fields: object, id = randomUUID()) => ({
  client_mutation_id: randomUUID(),
  entity: 'routine_block',
  op: 'upsert',
  id,
  base_version: 0,
  fields: {
    routine_id: FALL_ROUTINE,
    weekday: 0,
    start_min: 1320,
    end_min: 1380,
    title: 'Capstone reading',
    category_id: STUDY,
    effective_from: '2026-10-20',
    ...fields,
  },
});

describe('add every week (routine_block create)', () => {
  it("adding 'Capstone reading' Monday 22:00–23:00 every week writes a routine_block effective today", async () => {
    const id = randomUUID();
    const r = await one(owner, newBlock({}, id));
    expect(r).toMatchObject({ status: 'applied', entity: 'routine_block' });
    expect(r.row).toMatchObject({
      id,
      weekday: 0,
      start_min: 1320,
      end_min: 1380,
      title: 'Capstone reading',
      effective_from: '2026-10-20',
      effective_to: null,
      source: 'user',
      version: 1,
    });
  });
  it('refuses past effective dates, dates after the term, foreign routines and categories', async () => {
    expect(await one(owner, newBlock({ effective_from: '2026-10-19' }))).toMatchObject({
      status: 'rejected',
      error_code: 'bad_request',
    });
    expect(await one(owner, newBlock({ effective_from: '2026-12-14' }))).toMatchObject({
      status: 'rejected',
      error_code: 'bad_request',
      message: 'That day isn’t in Fall term.',
    });
    expect(await one(alice, newBlock({ routine_id: BOB_ROUTINE }))).toMatchObject({
      status: 'rejected',
      error_code: 'not_found',
    });
    expect(await one(owner, newBlock({ category_id: BOB_GYM }))).toMatchObject({
      status: 'rejected',
      error_code: 'not_found',
    });
  });
  it('an existing id is a conflict, never an overwrite', async () => {
    const r = await one(owner, newBlock({}, MON_SERMON));
    expect(r.status).toBe('conflict');
  });
  it('bad times never reach the database (5-minute grid, end after start)', async () => {
    expect((await push(owner, [newBlock({ start_min: 1321 })])).status).toBe(400);
    expect(await one(owner, newBlock({ start_min: 1380, end_min: 1320 }))).toMatchObject({
      status: 'rejected',
      error_code: 'bad_request',
    });
  });
});

describe('edit every week with a client-chosen id for the new version', () => {
  it('routine_block_edit uses new_block_id for the inserted row (offline edits keep stable ids)', async () => {
    const newId = randomUUID();
    const r = await one(owner, {
      client_mutation_id: randomUUID(),
      entity: 'routine_block_edit',
      block_id: MON_SERMON,
      base_version: 1,
      effective_from: '2026-10-26',
      new_block_id: newId,
      fields: { start_min: 630 },
    });
    expect(r).toMatchObject({
      status: 'applied',
      row: { id: newId, start_min: 630, effective_from: '2026-10-26' },
    });
    const old = await t.pool.query('select effective_to from routine_blocks where id = $1', [
      MON_SERMON,
    ]);
    expect(old.rows[0].effective_to).toBe('2026-10-26');
  });
  it('a taken new_block_id is refused', async () => {
    const blk = (await one(owner, newBlock({ weekday: 3 }))).row;
    const r = await one(owner, {
      client_mutation_id: randomUUID(),
      entity: 'routine_block_edit',
      block_id: blk.id,
      base_version: 1,
      effective_from: '2026-10-29',
      new_block_id: MON_SERMON,
      fields: { start_min: 1325 },
    });
    expect(r).toMatchObject({ status: 'rejected', error_code: 'bad_request' });
  });
});

describe('one-off moves, deletes and undo', () => {
  const ov = (fields: object | undefined, id = randomUUID(), op = 'upsert', base = 0) => ({
    client_mutation_id: randomUUID(),
    entity: 'override',
    op,
    id,
    base_version: base,
    ...(fields ? { fields } : {}),
  });
  it('move stays within the same week and inside a term', async () => {
    const base = { kind: 'move', routine_block_id: MON_SERMON, on_date: '2026-10-26' };
    expect(await one(owner, ov({ ...base, moved_to_date: '2026-10-28' }))).toMatchObject({
      status: 'applied',
    });
    expect(await one(owner, ov({ ...base, moved_to_date: '2026-11-03' }))).toMatchObject({
      status: 'rejected',
      message: 'Move it within the same week.',
    });
    expect(
      await one(
        owner,
        ov({
          kind: 'move',
          routine_block_id: MON_SERMON,
          on_date: '2026-12-21',
          moved_to_date: '2026-12-24',
        }),
      ),
    ).toMatchObject({ status: 'rejected', message: 'That day isn’t in Exam weeks.' });
  });
  it('delete then restore a one-off (Undo)', async () => {
    const id = randomUUID();
    await one(
      owner,
      ov(
        {
          kind: 'add',
          on_date: '2026-10-24',
          title: 'Pitch prep',
          start_min: 600,
          end_min: 660,
          category_id: SERMON,
        },
        id,
      ),
    );
    const del = await one(owner, ov(undefined, id, 'delete', 1));
    expect(del.row.deleted_at).not.toBeNull();
    const back = await one(owner, ov(undefined, id, 'restore', 2));
    expect(back).toMatchObject({ status: 'applied', row: { deleted_at: null, version: 3 } });
  });
  it("another user's block stays out of reach", async () => {
    expect(
      await one(
        alice,
        ov({ kind: 'skip', routine_block_id: BOB_PROBE_BLOCK, on_date: '2026-10-26' }),
      ),
    ).toMatchObject({ status: 'rejected', error_code: 'not_found' });
  });
});

describe('per-block alerts on the profile (D-32, stored in profile_json.block_alerts)', () => {
  it('sets and clears an alert without touching the rest of profile_json', async () => {
    await t.pool.query(`update users set profile_json = '{"priorities":["Gym"]}' where id = $1`, [
      BOB.id,
    ]);
    const cur = await t.pool.query('select version, profile_json from users where id = $1', [
      BOB.id,
    ]);
    const v = cur.rows[0].version;
    const a = await one(bob, {
      client_mutation_id: randomUUID(),
      entity: 'profile',
      op: 'upsert',
      base_version: v,
      fields: { block_alerts: { [MON_SERMON]: 10 } },
    });
    expect(a.status).toBe('applied');
    expect(a.row.profile_json.block_alerts).toEqual({ [MON_SERMON]: 10 });
    expect(a.row.profile_json.priorities).toEqual(cur.rows[0].profile_json.priorities);
    const b = await one(bob, {
      client_mutation_id: randomUUID(),
      entity: 'profile',
      op: 'upsert',
      base_version: v + 1,
      fields: { block_alerts: { [MON_SERMON]: null } },
    });
    expect(b.row.profile_json.block_alerts).toEqual({});
  });
});
