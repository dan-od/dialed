import type { Mutation, SyncChange } from '@dialed/contracts';
import { resolveDay } from '@dialed/schedule';
import { ApiError } from '../api/errors';
import { Blocks } from '../blocks/service';
import { MemoryStore } from '../data/memoryStore';
import { SyncEngine } from '../sync/engine';

// Flow 04 device service: every change is written locally at once (outbox), resolves through
// packages/schedule, and is shaped exactly as the server's sync push expects.
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STUDY = u(1);
const GYM = u(2);
const MEAL = u(3);
const TERM = u(10);
const ROUTINE = u(11);
const GYM_BLOCK = u(20); // Mon 4:15–5:30 pm
const LUNCH = u(21);
const TODAY = '2026-10-19'; // Monday
const cat = (id: string, name: string, group: string, quiet = false) => ({
  id,
  name,
  group_name: group,
  color_dark: '#5FD8BE',
  color_light: '#12917A',
  weight: 1,
  quiet,
  protected: false,
  sort: 0,
  version: 1,
  deleted_at: null,
});
const rows: SyncChange[] = [
  { entity: 'category', op: 'upsert', row: cat(STUDY, 'Study', 'School') },
  { entity: 'category', op: 'upsert', row: cat(GYM, 'Gym', 'Life') },
  { entity: 'category', op: 'upsert', row: cat(MEAL, 'Meal', 'Life', true) },
  {
    entity: 'term',
    op: 'upsert',
    row: {
      id: TERM,
      name: 'Fall term',
      starts_on: '2026-09-14',
      ends_on: '2026-12-11',
      is_draft: false,
      version: 1,
      deleted_at: null,
    },
  },
  {
    entity: 'routine',
    op: 'upsert',
    row: { id: ROUTINE, term_id: TERM, name: 'Fall term', version: 1 },
  },
  {
    entity: 'routine_block',
    op: 'upsert',
    row: {
      id: GYM_BLOCK,
      routine_id: ROUTINE,
      weekday: 0,
      start_min: 975,
      end_min: 1050,
      title: 'Gym',
      category_id: GYM,
      effective_from: '2026-09-14',
      effective_to: null,
      version: 1,
      deleted_at: null,
    },
  },
  {
    entity: 'routine_block',
    op: 'upsert',
    row: {
      id: LUNCH,
      routine_id: ROUTINE,
      weekday: 0,
      start_min: 720,
      end_min: 760,
      title: 'Lunch',
      category_id: MEAL,
      effective_from: '2026-09-14',
      effective_to: null,
      version: 1,
      deleted_at: null,
    },
  },
];

const engines: SyncEngine[] = [];
afterEach(() => engines.splice(0).forEach((e) => e.stop()));

async function setup() {
  const store = new MemoryStore();
  await store.replaceAll(rows, 7);
  const offline = async () => {
    throw new ApiError('offline', 'offline');
  };
  const engine = new SyncEngine(
    store,
    { pull: offline, push: offline },
    {
      changed: () => {},
      status: () => {},
      synced: () => {},
      conflict: () => {},
      rejected: () => {},
    },
  );
  engines.push(engine);
  let n = 100;
  const blocks = new Blocks(
    store,
    (m) => engine.enqueue(m),
    () => u(n++),
  );
  const day = async (date = TODAY) => resolveDay(date, (await store.load()).schedule).blocks;
  const sent = async () => (await store.outbox()).map((b) => b.mutation);
  return { store, engine, blocks, day, sent };
}
const gymOn = async (
  day: (d?: string) => Promise<ReturnType<typeof resolveDay>['blocks']>,
  d = TODAY,
) => (await day(d)).find((b) => b.title === 'Gym')!;

describe('blocks service (Flow 04)', () => {
  it("build seed: adding 'Capstone reading' Monday 22:00–23:00 every week writes a routine_block effective today and Day shows it", async () => {
    const { blocks, day, sent, engine } = await setup();
    const r = await blocks.addRoutine(
      ROUTINE,
      0,
      { title: 'Capstone reading', start_min: 1320, end_min: 1380, category_id: STUDY },
      TODAY,
      TODAY,
    );
    const [m] = await sent();
    expect(m).toMatchObject({
      entity: 'routine_block',
      op: 'upsert',
      base_version: 0,
      fields: {
        routine_id: ROUTINE,
        weekday: 0,
        start_min: 1320,
        end_min: 1380,
        title: 'Capstone reading',
        category_id: STUDY,
        effective_from: TODAY,
      },
    });
    const row = (await day()).find((b) => b.title === 'Capstone reading')!;
    expect(row.key).toBe(r.key); // the key the Day sheet highlights with "New"
    expect((await day('2026-10-12')).some((b) => b.title === 'Capstone reading')).toBe(false); // past Mondays unchanged
    expect((await day('2026-10-26')).some((b) => b.title === 'Capstone reading')).toBe(true);
    expect(engine.status.pending).toBe(1);
    expect((await engine['store'].load()).pending).toContain((m as { id: string }).id); // "· waiting to sync"
    engine.stop();
  });

  it('add today only writes an override kind add for that date', async () => {
    const { blocks, day, sent } = await setup();
    const r = await blocks.addOneOff(TODAY, {
      title: 'Read Acts 2',
      start_min: 1320,
      end_min: 1365,
      category_id: STUDY,
    });
    expect((await sent())[0]).toMatchObject({
      entity: 'override',
      op: 'upsert',
      base_version: 0,
      fields: {
        kind: 'add',
        on_date: TODAY,
        title: 'Read Acts 2',
        start_min: 1320,
        end_min: 1365,
        category_id: STUDY,
      },
    });
    expect((await day()).find((b) => b.key === r.key)?.source).toBe('one_off');
    expect((await day('2026-10-26')).some((b) => b.title === 'Read Acts 2')).toBe(false);
  });

  it('edit this Monday only: override modify; other Mondays keep the routine', async () => {
    const { blocks, day, sent } = await setup();
    await blocks.modifyOnce(await gymOn(day), { start_min: 990, end_min: 1065 });
    expect((await sent())[0]).toMatchObject({
      entity: 'override',
      fields: {
        kind: 'modify',
        routine_block_id: GYM_BLOCK,
        on_date: TODAY,
        start_min: 990,
        end_min: 1065,
      },
    });
    expect((await gymOn(day)).start_min).toBe(990);
    expect((await gymOn(day, '2026-10-26')).start_min).toBe(975);
    // a second change the same day updates the same override (its predicted version)
    await blocks.modifyOnce(await gymOn(day), { title: 'Gym, legs' });
    const [first, second] = await sent();
    expect(second).toMatchObject({
      entity: 'override',
      id: (first as { id: string }).id,
      base_version: 1,
      fields: { kind: 'modify', title: 'Gym, legs' },
    });
    expect(await gymOn(day)).toBeUndefined();
    expect((await day()).find((b) => b.title === 'Gym, legs')?.start_min).toBe(990);
  });

  it('edit every Monday: one routine_block_edit from the date; past Mondays unchanged, offline version predicted', async () => {
    const { blocks, day, sent } = await setup();
    const r = await blocks.modifyEvery(await gymOn(day), { start_min: 1000, end_min: 1075 }, TODAY);
    const [m] = await sent();
    expect(m).toMatchObject({
      entity: 'routine_block_edit',
      block_id: GYM_BLOCK,
      base_version: 1,
      effective_from: TODAY,
      fields: { start_min: 1000, end_min: 1075 },
    });
    const newId = (m as { new_block_id: string }).new_block_id;
    expect(newId).toBeTruthy();
    expect(r.key).toBe(`${newId}:${TODAY}`);
    expect((await gymOn(day)).start_min).toBe(1000);
    expect((await gymOn(day, '2026-10-26')).start_min).toBe(1000);
    expect((await gymOn(day, '2026-10-12')).start_min).toBe(975); // past days never change
  });

  it('move this week only: override move to the target date in the same week', async () => {
    const { blocks, day, sent } = await setup();
    await blocks.moveOnce(await gymOn(day), '2026-10-21');
    expect((await sent())[0]).toMatchObject({
      entity: 'override',
      fields: {
        kind: 'move',
        routine_block_id: GYM_BLOCK,
        on_date: TODAY,
        moved_to_date: '2026-10-21',
      },
    });
    expect(await gymOn(day)).toBeUndefined();
    expect((await gymOn(day, '2026-10-21')).start_min).toBe(975);
    expect((await gymOn(day, '2026-10-26')).start_min).toBe(975);
  });

  it('move every week: routine_block_edit with fields.weekday', async () => {
    const { blocks, day, sent } = await setup();
    await blocks.moveEvery(await gymOn(day), 2, {}, TODAY);
    expect((await sent())[0]).toMatchObject({
      entity: 'routine_block_edit',
      block_id: GYM_BLOCK,
      fields: { weekday: 2 },
      effective_from: TODAY,
    });
    expect(await gymOn(day)).toBeUndefined();
    expect((await gymOn(day, '2026-10-21')).start_min).toBe(975);
    expect((await gymOn(day, '2026-10-12')).start_min).toBe(975); // last Monday still had Gym
  });

  it('skip this Monday, then Undo deletes the skip', async () => {
    const { blocks, day, sent } = await setup();
    const r = await blocks.skipOnce(await gymOn(day));
    expect(await gymOn(day)).toBeUndefined();
    await r.undo();
    const [skip, undo] = await sent();
    expect(skip).toMatchObject({
      entity: 'override',
      op: 'upsert',
      fields: { kind: 'skip', routine_block_id: GYM_BLOCK, on_date: TODAY },
    });
    expect(undo).toMatchObject({
      entity: 'override',
      op: 'delete',
      id: (skip as { id: string }).id,
      base_version: 1,
    });
    expect((await gymOn(day)).start_min).toBe(975);
  });

  it('delete every Monday closes it from today (past keeps it); Undo reopens', async () => {
    const { blocks, day, sent } = await setup();
    const r = await blocks.deleteBlock(await gymOn(day), TODAY);
    expect(await gymOn(day)).toBeUndefined();
    expect((await gymOn(day, '2026-10-12')).start_min).toBe(975);
    await r.undo();
    const [close, reopen] = await sent();
    expect(close).toMatchObject({
      entity: 'routine_block_edit',
      block_id: GYM_BLOCK,
      base_version: 1,
      effective_from: TODAY,
      close: true,
    });
    expect(reopen).toMatchObject({
      entity: 'routine_block_edit',
      block_id: GYM_BLOCK,
      base_version: 2,
      reopen: true,
    });
    expect((await gymOn(day)).start_min).toBe(975);
  });

  it('delete a one-off, then Undo restores it', async () => {
    const { blocks, day, sent } = await setup();
    const add = await blocks.addOneOff(TODAY, {
      title: 'Pitch prep',
      start_min: 1320,
      end_min: 1380,
      category_id: STUDY,
    });
    const b = (await day()).find((x) => x.key === add.key)!;
    const r = await blocks.deleteBlock(b, TODAY);
    expect((await day()).some((x) => x.key === add.key)).toBe(false);
    await r.undo();
    const [, del, restore] = await sent();
    expect(del).toMatchObject({ entity: 'override', op: 'delete', base_version: 1 });
    expect(restore).toMatchObject({ entity: 'override', op: 'restore', base_version: 2 });
    expect((await day()).some((x) => x.key === add.key)).toBe(true);
  });

  it('a moved block can be edited and moved again (updates its move override)', async () => {
    const { blocks, day, sent } = await setup();
    await blocks.moveOnce(await gymOn(day), '2026-10-21');
    await blocks.modifyOnce(await gymOn(day, '2026-10-21'), { start_min: 1080, end_min: 1140 });
    const [move, edit] = (await sent()) as Mutation[] as (Mutation & { id: string })[];
    expect(edit).toMatchObject({
      entity: 'override',
      id: move!.id,
      base_version: 1,
      fields: { kind: 'move', start_min: 1080 },
    });
    expect((await gymOn(day, '2026-10-21')).start_min).toBe(1080);
  });

  it('recent categories: last 3 used, newest first, falling back to work categories', async () => {
    const { blocks } = await setup();
    expect(await blocks.recentCategories()).toEqual([STUDY, GYM]); // no history yet: work categories, quiet ones left out
    await blocks.addOneOff(TODAY, { title: 'A', start_min: 1320, end_min: 1330, category_id: GYM });
    expect((await blocks.recentCategories())[0]).toBe(GYM);
  });
  it('create a category: category upsert with the swatch pair; names are unique ignoring case', async () => {
    const { blocks, sent, store } = await setup();
    const r = await blocks.createCategory('Bible study', 'Life', ['#9FE0D0', '#2BA58A']);
    expect(r).toEqual({ ok: true, id: expect.any(String) });
    expect((await sent())[0]).toMatchObject({
      entity: 'category',
      op: 'upsert',
      base_version: 0,
      fields: {
        name: 'Bible study',
        group_name: 'Life',
        color_dark: '#9FE0D0',
        color_light: '#2BA58A',
      },
    });
    expect((await store.load()).schedule.categories.some((c) => c.name === 'Bible study')).toBe(
      true,
    );
    expect(await blocks.createCategory('  bible STUDY ', 'Life', ['#9FE0D0', '#2BA58A'])).toEqual({
      ok: false,
      message: 'You already have Bible study.',
    });
  });
  it("term dates: a term upsert with the row's version; a new term carries its routine id", async () => {
    const { blocks, sent, store } = await setup();
    await blocks.updateTerm(TERM, { starts_on: '2026-09-14', ends_on: '2026-12-18' });
    expect((await sent())[0]).toMatchObject({
      entity: 'term',
      op: 'upsert',
      id: TERM,
      base_version: 1,
      fields: { name: 'Fall term', starts_on: '2026-09-14', ends_on: '2026-12-18' },
    });
    const r = await blocks.createTerm('Summer term', '2027-05-03', '2027-08-20');
    expect((await sent())[1]).toMatchObject({
      entity: 'term',
      op: 'upsert',
      id: r.termId,
      base_version: 0,
      fields: { name: 'Summer term', routine_id: r.routineId },
    });
    expect((await store.getRow('routine', r.routineId))?.term_id).toBe(r.termId);
  });
  it('saving a routine queues one routine_save and sets alerts chosen in routine mode', async () => {
    const { blocks, sent, store } = await setup();
    await store.upsertRows([
      {
        entity: 'profile',
        op: 'upsert',
        row: { display_name: 'O', time_zone: 'America/Toronto', version: 3, profile_json: {} },
      },
    ]);
    const draft = {
      routineId: ROUTINE,
      base: {},
      trash: {},
      days: [
        [
          {
            id: u(77),
            weekday: 0,
            start_min: 1320,
            end_min: 1380,
            title: 'Read',
            category_id: STUDY,
          },
        ],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    await blocks.saveRoutine(draft, '2026-10-26', { [u(77)]: 10 });
    const [save, alert] = await sent();
    expect(save).toMatchObject({
      entity: 'routine_save',
      routine_id: ROUTINE,
      base_version: 1,
      effective_from: '2026-10-26',
      ops: [{ op: 'add', block_id: u(77) }],
    });
    expect(alert).toMatchObject({ entity: 'profile', fields: { block_alerts: { [u(77)]: 10 } } });
  });
});
