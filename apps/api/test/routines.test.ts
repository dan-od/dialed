import { randomUUID } from 'node:crypto';
import { resolveDay, type ScheduleData } from '@dialed/schedule';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, login, makeApp, TEST_NOW, type TestApp } from './helpers';

// Flow 05 server rules: `routine_save` (one atomic, effective-dated transaction) and term dates.
// Clock: Tue 2026-10-20 12:00 Toronto, so "next Monday" is 2026-10-26. Writes use Alice's seed only.
const FALL_ROUTINE = '60eec3ef-59af-52e0-b13f-6826bd08e994';
const FALL_TERM = '1808c6be-f174-5e1b-9445-b458c0d0f328';
const GYM = 'f3263fc8-0b7f-588f-82d0-47696d80c251';
const STUDY = '64251711-ded6-5b6f-ad18-bc84900fc568';
const BOB_GYM = '0f1c2cef-0f68-53db-9e68-363d31054af5';

let t: TestApp;
let alice: Awaited<ReturnType<typeof login>>;
let bob: Awaited<ReturnType<typeof login>>;
let gymBlock: string; // Alice's Monday Gym 16:15–17:30, in the routine since the term began
beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  alice = await login(t, ALICE.email);
  bob = await login(t, BOB.email);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await t.pool.query(`delete from routine_blocks where user_id = $1 and title ~ '^Gym'`, [
    ALICE.id,
  ]);
  gymBlock = randomUUID();
  await t.pool.query(
    `insert into routine_blocks (id, routine_id, user_id, weekday, start_min, end_min, title, category_id, effective_from, source)
     values ($1, $2, $3, 0, 975, 1050, 'Gym', $4, '2026-09-14', 'seed')`,
    [gymBlock, FALL_ROUTINE, ALICE.id, GYM],
  );
});

const push = async (s: { access_token: string }, m: object) => {
  const r = await t.app.inject({
    method: 'POST',
    url: '/v1/sync/push',
    headers: { authorization: `Bearer ${s.access_token}` },
    payload: { mutations: [{ client_mutation_id: randomUUID(), ...m }] },
  });
  return r.statusCode === 200 ? r.json().results[0] : { http: r.statusCode, ...r.json() };
};
const routineVersion = async () =>
  Number(
    (await t.pool.query('select version from routines where id = $1', [FALL_ROUTINE])).rows[0]
      .version,
  );
const save = async (ops: object[], over: object = {}) =>
  push(alice, {
    entity: 'routine_save',
    routine_id: FALL_ROUTINE,
    base_version: await routineVersion(),
    effective_from: '2026-10-26',
    ops,
    ...over,
  });

/** Alice's schedule straight from Postgres, in the shape packages/schedule resolves. */
async function aliceData(): Promise<ScheduleData> {
  const q = async (sql: string) => (await t.pool.query(sql, [ALICE.id])).rows;
  const cats = await q('select * from categories where user_id = $1');
  return {
    categories: cats.map((c) => ({ ...c, weight: Number(c.weight) })),
    terms: await q('select * from terms where user_id = $1'),
    routines: await q('select * from routines where user_id = $1'),
    routineBlocks: await q('select * from routine_blocks where user_id = $1'),
    overrides: await q('select * from overrides where user_id = $1'),
  } as ScheduleData;
}
const gymOn = async (date: string) =>
  resolveDay(date, await aliceData()).blocks.filter((b) => b.title.startsWith('Gym'));

describe('routine_save (Flow 05)', () => {
  it('build seed: Monday Gym moved to 17:00 from 2026-10-26 leaves Oct 19 unchanged and changes Oct 26', async () => {
    const newId = randomUUID();
    const r = await save([
      {
        op: 'update',
        block_id: gymBlock,
        new_block_id: newId,
        fields: { start_min: 1020, end_min: 1095 },
      },
    ]);
    expect(r).toMatchObject({ status: 'applied', entity: 'routine' });
    expect((await gymOn('2026-10-19')).map((b) => b.start_min)).toEqual([975]);
    expect((await gymOn('2026-10-26')).map((b) => [b.start_min, b.end_min])).toEqual([
      [1020, 1095],
    ]);
    const old = await t.pool.query('select effective_to from routine_blocks where id = $1', [
      gymBlock,
    ]);
    expect(old.rows[0].effective_to).toBe('2026-10-26');
  });

  it('add, update and close in one transaction; the routine version moves once', async () => {
    const v = await routineVersion();
    const added = randomUUID();
    const r = await save([
      {
        op: 'add',
        block_id: added,
        fields: {
          weekday: 2,
          start_min: 1320,
          end_min: 1380,
          title: 'Capstone reading',
          category_id: STUDY,
        },
      },
      { op: 'close', block_id: gymBlock },
    ]);
    expect(r.status).toBe('applied');
    expect(await routineVersion()).toBe(v + 1);
    const a = await t.pool.query(
      'select effective_from, weekday, source from routine_blocks where id = $1',
      [added],
    );
    expect(a.rows[0]).toMatchObject({ effective_from: '2026-10-26', weekday: 2, source: 'user' });
    expect(await gymOn('2026-10-19')).toHaveLength(1);
    expect(await gymOn('2026-10-26')).toHaveLength(0);
  });

  it('a block that starts on the effective date is changed in place, not versioned', async () => {
    const added = randomUUID();
    await save([
      {
        op: 'add',
        block_id: added,
        fields: { weekday: 3, start_min: 600, end_min: 660, title: 'Read', category_id: STUDY },
      },
    ]);
    const r = await save([
      { op: 'update', block_id: added, new_block_id: randomUUID(), fields: { title: 'Read Acts' } },
    ]);
    expect(r.status).toBe('applied');
    const rows = await t.pool.query(
      'select title, effective_from from routine_blocks where id = $1',
      [added],
    );
    expect(rows.rows[0]).toMatchObject({ title: 'Read Acts', effective_from: '2026-10-26' });
  });

  it('one bad op rejects the whole save (nothing half-applied)', async () => {
    const v = await routineVersion();
    const added = randomUUID();
    const r = await save([
      {
        op: 'add',
        block_id: added,
        fields: { weekday: 1, start_min: 600, end_min: 660, title: 'Ok', category_id: STUDY },
      },
      {
        op: 'update',
        block_id: gymBlock,
        new_block_id: randomUUID(),
        fields: { start_min: 1100, end_min: 1000 },
      },
    ]);
    expect(r).toMatchObject({ status: 'rejected', error_code: 'bad_request' });
    expect(await routineVersion()).toBe(v);
    expect(
      (await t.pool.query('select 1 from routine_blocks where id = $1', [added])).rows,
    ).toHaveLength(0);
  });

  it('stale base_version → conflict with the current routine; past effective dates are refused', async () => {
    const v = await routineVersion();
    expect(
      await save([{ op: 'close', block_id: gymBlock }], { base_version: v - 1 || 99 }),
    ).toMatchObject({ status: 'conflict', entity: 'routine' });
    expect(
      await save([{ op: 'close', block_id: gymBlock }], { effective_from: '2026-10-19' }),
    ).toMatchObject({
      status: 'rejected',
      message: 'Past days never change. Pick today or later.',
    });
    expect(
      (await save([{ op: 'close', block_id: gymBlock }], { effective_from: '2026-10-20' })).status,
    ).toBe('applied'); // today is allowed
  });

  it('other users: foreign routine, foreign block id, foreign category → not_found', async () => {
    expect(
      await push(bob, {
        entity: 'routine_save',
        routine_id: FALL_ROUTINE,
        base_version: await routineVersion(),
        effective_from: '2026-10-26',
        ops: [],
      }),
    ).toMatchObject({ status: 'rejected', error_code: 'not_found' });
    expect(
      await save([
        {
          op: 'add',
          block_id: randomUUID(),
          fields: { weekday: 1, start_min: 600, end_min: 660, title: 'x', category_id: BOB_GYM },
        },
      ]),
    ).toMatchObject({ error_code: 'not_found' });
    const bobBlock = (
      await t.pool.query('select id from routine_blocks where user_id = $1 limit 1', [BOB.id])
    ).rows[0].id;
    expect(await save([{ op: 'close', block_id: bobBlock }])).toMatchObject({
      error_code: 'not_found',
    });
  });

  it('caps a save at 200 ops (400 from the schema)', async () => {
    const ops = Array.from({ length: 201 }, () => ({ op: 'close', block_id: gymBlock }));
    expect((await save(ops)).http).toBe(400);
  });
});

describe('term dates and new terms (Flow 05)', () => {
  const termVersion = async () =>
    Number(
      (await t.pool.query('select version from terms where id = $1', [FALL_TERM])).rows[0].version,
    );
  it('ends before starts is refused with the inline copy', async () => {
    const r = await push(alice, {
      entity: 'term',
      op: 'upsert',
      id: FALL_TERM,
      base_version: await termVersion(),
      fields: { name: 'Fall term', starts_on: '2026-09-14', ends_on: '2026-09-01' },
    });
    expect(r).toMatchObject({ status: 'rejected', message: 'Ends needs to be after starts.' });
  });
  it('moving the end date is saved', async () => {
    const r = await push(alice, {
      entity: 'term',
      op: 'upsert',
      id: FALL_TERM,
      base_version: await termVersion(),
      fields: { name: 'Fall term', starts_on: '2026-09-14', ends_on: '2026-12-11' },
    });
    expect(r).toMatchObject({ status: 'applied', row: { ends_on: '2026-12-11' } });
  });
  it('a new term comes with its routine, using the client-chosen routine id', async () => {
    const term = randomUUID();
    const routine = randomUUID();
    const r = await push(alice, {
      entity: 'term',
      op: 'upsert',
      id: term,
      base_version: 0,
      fields: {
        name: 'Summer term',
        starts_on: '2027-05-03',
        ends_on: '2027-08-20',
        is_draft: true,
        routine_id: routine,
      },
    });
    expect(r).toMatchObject({ status: 'applied', row: { name: 'Summer term' } });
    expect(r.row.routine_id).toBeUndefined(); // not a term column
    const row = await t.pool.query('select term_id, name from routines where id = $1', [routine]);
    expect(row.rows[0]).toMatchObject({ term_id: term, name: 'Summer term' });
  });
});
