import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ALICE, BOB, login, makeApp, TEST_NOW, type TestApp } from './helpers';

// Flow 09 server rules: category merge (+ Undo within 10 min) and delete with reassignment, atomically.
// Clock: Tue 2026-10-20 12:00 Toronto. Fixture: Alice's Speedwatch Ontario gets 3 routine blocks (as the owner's
// Fall term: Tue 15:00, Thu 19:00, Fri 19:15), one past and one future one-off.
const FALL_ROUTINE = '60eec3ef-59af-52e0-b13f-6826bd08e994';
const SPEED = 'e05ddd63-6d03-5c7c-8085-8627261d1c3d';
const WELL = 'b4928b85-85d3-598b-a6ef-1b682cb5d12e';
const SERMON = '4cab5eda-de35-5927-b0cc-54bd5dadabf3';
const BOB_GYM = '0f1c2cef-0f68-53db-9e68-363d31054af5';

let t: TestApp;
let alice: Awaited<ReturnType<typeof login>>;
let bob: Awaited<ReturnType<typeof login>>;
let blocks: string[];
let pastOv: string;
let futureOv: string;

beforeAll(async () => {
  t = await makeApp({}, undefined, TEST_NOW);
  alice = await login(t, ALICE.email);
  bob = await login(t, BOB.email);
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  const q = (s: string, p: unknown[] = []) => t.pool.query(s, p);
  await q(`delete from category_merges where user_id = $1`, [ALICE.id]);
  await q(`delete from overrides where user_id = $1 and note = 'f09'`, [ALICE.id]);
  await q(`delete from routine_blocks where user_id = $1 and title = 'Speedwatch Ontario'`, [
    ALICE.id,
  ]);
  await q(`update categories set deleted_at = null, name = 'Speedwatch Ontario' where id = $1`, [
    SPEED,
  ]);
  blocks = [randomUUID(), randomUUID(), randomUUID()];
  const at: [number, number, number][] = [
    [1, 900, 990],
    [3, 1140, 1230],
    [4, 1155, 1230],
  ];
  for (const [i, [wd, s, e]] of at.entries())
    await q(
      `insert into routine_blocks (id, routine_id, user_id, weekday, start_min, end_min, title, category_id, effective_from, source)
       values ($1, $2, $3, $4, $5, $6, 'Speedwatch Ontario', $7, '2026-09-14', 'seed')`,
      [blocks[i], FALL_ROUTINE, ALICE.id, wd, s, e, SPEED],
    );
  pastOv = randomUUID();
  futureOv = randomUUID();
  for (const [id, d] of [
    [pastOv, '2026-10-12'],
    [futureOv, '2026-10-24'],
  ])
    await q(
      `insert into overrides (id, user_id, on_date, kind, title, start_min, end_min, category_id, note)
       values ($1, $2, $3, 'add', 'Speedwatch call', 600, 660, $4, 'f09')`,
      [id, ALICE.id, d, SPEED],
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
const version = async (id: string) =>
  Number(
    (await t.pool.query('select version from categories where id = $1', [id])).rows[0].version,
  );
const catOf = async (table: string, id: string) =>
  (await t.pool.query(`select category_id from ${table} where id = $1`, [id])).rows[0].category_id;
const merge = async (from = SPEED, to = WELL, over: object = {}) =>
  push(alice, {
    entity: 'category_merge',
    from,
    to,
    from_version: await version(from),
    to_version: await version(to),
    ...over,
  });
const liveCategories = async () =>
  (
    await t.pool.query(
      `select name from categories where user_id = $1 and deleted_at is null order by sort`,
      [ALICE.id],
    )
  ).rows.map((r) => r.name);

describe('category_merge (Flow 09 build seed)', () => {
  it('merging Speedwatch Ontario into WellServices reassigns 3 routine blocks and removes Speedwatch from list_categories in one revision', async () => {
    const before = Number(
      (await t.pool.query('select revision from revisions where user_id = $1', [ALICE.id])).rows[0]
        .revision,
    );
    const r = await merge();
    expect(r.status).toBe('applied');
    expect(r.merge_id).toEqual(expect.any(String));
    expect(r.moved).toBe(3);
    for (const b of blocks) expect(await catOf('routine_blocks', b)).toBe(WELL);
    // A category is a label: one-offs move too, past ones included (the old category goes away).
    expect(await catOf('overrides', pastOv)).toBe(WELL);
    expect(await catOf('overrides', futureOv)).toBe(WELL);
    expect(await liveCategories()).not.toContain('Speedwatch Ontario');
    expect(r.revision).toBe(before + 1);
    const log = await t.pool.query(
      `select entity, entity_id from change_log where user_id = $1 and revision = $2`,
      [ALICE.id, r.revision],
    );
    const ids = log.rows.map((x) => x.entity_id);
    expect(ids).toEqual(expect.arrayContaining([SPEED, ...blocks, pastOv, futureOv]));
  });
  it('is refused on a stale version, a merge into itself, or another person’s category', async () => {
    expect((await merge(SPEED, WELL, { from_version: 999 })).status).toBe('conflict');
    expect((await merge(SPEED, SPEED)).status).toBe('rejected');
    const foreign = await push(alice, {
      entity: 'category_merge',
      from: SPEED,
      to: BOB_GYM,
      from_version: await version(SPEED),
      to_version: await version(BOB_GYM),
    });
    expect(foreign).toMatchObject({ status: 'rejected', error_code: 'not_found' });
    // Nothing moved.
    for (const b of blocks) expect(await catOf('routine_blocks', b)).toBe(SPEED);
  });
  it('Undo (within 10 minutes) puts the category and every moved row back', async () => {
    const m = await merge();
    const u = await push(alice, { entity: 'category_unmerge', merge_id: m.merge_id });
    expect(u.status).toBe('applied');
    for (const b of blocks) expect(await catOf('routine_blocks', b)).toBe(SPEED);
    expect(await catOf('overrides', pastOv)).toBe(SPEED);
    expect(await liveCategories()).toContain('Speedwatch Ontario');
    // Twice: nothing left to undo.
    const again = await push(alice, { entity: 'category_unmerge', merge_id: m.merge_id });
    expect(again.status).toBe('rejected');
  });
  it('Undo leaves rows that moved again since, and is refused after 10 minutes or for someone else', async () => {
    const m = await merge();
    await t.pool.query('update routine_blocks set category_id = $1 where id = $2', [
      SERMON,
      blocks[0],
    ]);
    expect((await push(bob, { entity: 'category_unmerge', merge_id: m.merge_id })).status).toBe(
      'rejected',
    );
    await push(alice, { entity: 'category_unmerge', merge_id: m.merge_id });
    expect(await catOf('routine_blocks', blocks[0]!)).toBe(SERMON);
    expect(await catOf('routine_blocks', blocks[1]!)).toBe(SPEED);

    const late = await merge();
    await t.pool.query(
      `update category_merges set created_at = created_at - interval '11 minutes' where id = $1`,
      [late.merge_id],
    );
    const u = await push(alice, { entity: 'category_unmerge', merge_id: late.merge_id });
    expect(u).toMatchObject({ status: 'rejected', error_code: 'too_late' });
  });
});

describe('category_delete', () => {
  const del = async (over: object) =>
    push(alice, {
      entity: 'category_delete',
      id: SPEED,
      base_version: await version(SPEED),
      ...over,
    });
  it('moves every block to the picked category, then removes it', async () => {
    const r = await del({ reassign_to: SERMON });
    expect(r.status).toBe('applied');
    for (const b of blocks) expect(await catOf('routine_blocks', b)).toBe(SERMON);
    expect(await catOf('overrides', futureOv)).toBe(SERMON);
    expect(await liveCategories()).not.toContain('Speedwatch Ontario');
  });
  it('"Delete those blocks too" ends them from today; past days keep theirs', async () => {
    const r = await del({ delete_blocks: true });
    expect(r.status).toBe('applied');
    const rows = (
      await t.pool.query(
        'select effective_to::text as effective_to from routine_blocks where id = any($1)',
        [blocks],
      )
    ).rows;
    for (const b of rows) expect(b.effective_to).toBe('2026-10-20');
    const ov = async (id: string) =>
      (await t.pool.query('select deleted_at from overrides where id = $1', [id])).rows[0]
        .deleted_at;
    expect(await ov(pastOv)).toBeNull();
    expect(await ov(futureOv)).not.toBeNull();
  });
  it('needs a choice while blocks use it, and none when nothing does', async () => {
    expect((await del({})).status).toBe('rejected');
    expect((await del({ reassign_to: SERMON, delete_blocks: true })).http).toBe(400);
    expect((await del({ reassign_to: SPEED })).status).toBe('rejected');
    expect((await del({ reassign_to: BOB_GYM })).error_code).toBe('not_found');
    await t.pool.query(`delete from routine_blocks where id = any($1)`, [blocks]);
    await t.pool.query(`delete from overrides where note = 'f09'`);
    expect((await del({})).status).toBe('applied');
  });
  it('a plain category delete is refused while blocks still use it', async () => {
    const r = await push(alice, {
      entity: 'category',
      op: 'delete',
      id: SPEED,
      base_version: await version(SPEED),
    });
    expect(r).toMatchObject({ status: 'rejected', error_code: 'in_use' });
  });
});
