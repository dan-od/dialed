import type { Mutation, SyncChange } from '@dialed/contracts';
import { resolveDay } from '@dialed/schedule';
import { ApiError } from '../api/errors';
import { MemoryStore } from '../data/memoryStore';
import { localEffects } from '../data/shape';
import {
  baseWeek,
  copyDay,
  dayHours,
  draftOps,
  editBlock,
  addBlock,
  removeBlock,
  restoreBlock,
  saveMutation,
  type RoutineDraft,
} from '../routines/draft';
import { SyncEngine } from '../sync/engine';

// Flow 05 routine editor: a local draft of the repeating week; Save sends one routine_save.
const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const STUDY = u(1);
const GYM = u(2);
const MEAL = u(3);
const CLASS = u(4);
const TERM = u(10);
const ROUTINE = u(11);
const cat = (id: string, name: string, quiet = false) => ({
  id,
  name,
  group_name: 'x',
  color_dark: '#000000',
  color_light: '#000000',
  weight: 1,
  quiet,
  protected: false,
  sort: 0,
  version: 1,
  deleted_at: null,
});
const rb = (
  id: string,
  weekday: number,
  start: number,
  end: number,
  title: string,
  category_id: string,
  extra: object = {},
) => ({
  id,
  routine_id: ROUTINE,
  weekday,
  start_min: start,
  end_min: end,
  title,
  category_id,
  effective_from: '2026-09-14',
  effective_to: null,
  version: 1,
  deleted_at: null,
  ...extra,
});
const GYM_MON = u(20);
const CLASS_MON = u(21);
const LUNCH_MON = u(22);
const rows: SyncChange[] = [
  { entity: 'category', op: 'upsert', row: cat(STUDY, 'Study') },
  { entity: 'category', op: 'upsert', row: cat(GYM, 'Gym') },
  { entity: 'category', op: 'upsert', row: cat(MEAL, 'Meal', true) },
  { entity: 'category', op: 'upsert', row: { ...cat(CLASS, 'Class'), protected: true } },
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
    row: { id: ROUTINE, term_id: TERM, name: 'Fall term', version: 4 },
  },
  { entity: 'routine_block', op: 'upsert', row: rb(GYM_MON, 0, 975, 1050, 'Gym', GYM) },
  {
    entity: 'routine_block',
    op: 'upsert',
    row: rb(CLASS_MON, 0, 580, 660, 'Advanced Networking I', STUDY),
  },
  { entity: 'routine_block', op: 'upsert', row: rb(LUNCH_MON, 0, 720, 760, 'Lunch', MEAL) },
  // a version that already ended (history) must not show in the editor
  {
    entity: 'routine_block',
    op: 'upsert',
    row: rb(u(23), 1, 600, 700, 'Old Tuesday', STUDY, { effective_to: '2026-10-01' }),
  },
];
let n = 100;
const ids = () => u(n++);

async function setup() {
  const store = new MemoryStore();
  await store.replaceAll(rows, 9);
  const data = await store.load();
  return { store, data };
}

describe('routine draft (Flow 05)', () => {
  it('base week: the open-ended (current and future) blocks by weekday and start; ended versions left out', async () => {
    const { data } = await setup();
    const d = baseWeek(data.schedule, ROUTINE);
    expect(d.days[0]!.map((b) => b.title)).toEqual(['Advanced Networking I', 'Lunch', 'Gym']);
    expect(d.days[1]).toEqual([]);
    expect(dayHours(d, 0, data.schedule.categories)).toBe(2.6); // work blocks only: 80 + 75 min (Lunch is quiet)
  });

  it('build seed: Gym moved to 17:00 effective next Monday → one routine_save; Oct 19 unchanged, Oct 26 changed', async () => {
    const { store, data } = await setup();
    let d: RoutineDraft = baseWeek(data.schedule, ROUTINE);
    d = editBlock(d, GYM_MON, { start_min: 1020, end_min: 1095 });
    expect(draftOps(d, ids)).toEqual([
      {
        op: 'update',
        block_id: GYM_MON,
        new_block_id: expect.any(String),
        fields: { start_min: 1020, end_min: 1095 },
      },
    ]);
    const m = saveMutation(d, 4, '2026-10-26', ids);
    expect(m).toMatchObject({
      entity: 'routine_save',
      routine_id: ROUTINE,
      base_version: 4,
      effective_from: '2026-10-26',
    });
    // queued offline: the phone applies it locally at once
    const offline = async () => {
      throw new ApiError('offline', 'offline');
    };
    const engine = new SyncEngine(
      store,
      { pull: offline, push: offline },
      { changed() {}, status() {}, synced() {}, conflict() {}, rejected() {} },
    );
    await engine.enqueue(m as Mutation);
    const after = (await store.load()).schedule;
    const gym = (date: string) =>
      resolveDay(date, after)
        .blocks.filter((b) => b.title === 'Gym')
        .map((b) => b.start_min);
    expect(gym('2026-10-19')).toEqual([975]);
    expect(gym('2026-10-26')).toEqual([1020]);
    expect((await store.getRow('routine', ROUTINE))?.version).toBe(5);
    engine.stop();
  });

  it('remove then Undo restores the row; remove alone becomes a close', async () => {
    const { data } = await setup();
    const d0 = baseWeek(data.schedule, ROUTINE);
    const d1 = removeBlock(d0, CLASS_MON);
    expect(d1.days[0]!.map((b) => b.title)).toEqual(['Lunch', 'Gym']);
    expect(draftOps(d1, ids)).toEqual([{ op: 'close', block_id: CLASS_MON }]);
    const d2 = restoreBlock(d1, CLASS_MON);
    expect(draftOps(d2, ids)).toEqual([]);
  });

  it('added blocks are adds; editing an added block stays an add', async () => {
    const { data } = await setup();
    let d = baseWeek(data.schedule, ROUTINE);
    d = addBlock(
      d,
      2,
      { title: 'Capstone reading', start_min: 1320, end_min: 1380, category_id: STUDY },
      ids,
    );
    const id = d.days[2]![0]!.id;
    d = editBlock(d, id, { title: 'Capstone' });
    expect(draftOps(d, ids)).toEqual([
      {
        op: 'add',
        block_id: id,
        fields: {
          weekday: 2,
          start_min: 1320,
          end_min: 1380,
          title: 'Capstone',
          category_id: STUDY,
        },
      },
    ]);
  });

  it('copy Monday to Tuesday and Thursday replaces what was there; overlaps are flagged', async () => {
    const { data } = await setup();
    let d = baseWeek(data.schedule, ROUTINE);
    d = addBlock(
      d,
      3,
      { title: 'Thursday thing', start_min: 600, end_min: 700, category_id: STUDY },
      ids,
    );
    const r = copyDay(d, 0, [1, 3], ids);
    expect(r.replaces).toEqual([3]); // only days that had blocks are "replaced"
    expect(r.draft.days[1]!.map((b) => b.title)).toEqual(['Advanced Networking I', 'Lunch', 'Gym']);
    expect(r.draft.days[3]!.map((b) => b.title)).toEqual(['Advanced Networking I', 'Lunch', 'Gym']);
    expect(draftOps(r.draft, ids).filter((o) => o.op === 'add')).toHaveLength(6);
    expect(copyDay(d, 0, [], ids).error).toBe('Pick at least one day.');
  });

  it('no changes → no ops (Save stays disabled)', async () => {
    const { data } = await setup();
    const d = baseWeek(data.schedule, ROUTINE);
    expect(draftOps(editBlock(d, GYM_MON, { start_min: 975 }), ids)).toEqual([]);
  });
  it('re-applying the queued save on top of a pull gives the same rows (no double versions)', async () => {
    const { store, data } = await setup();
    const d = editBlock(baseWeek(data.schedule, ROUTINE), GYM_MON, {
      start_min: 1020,
      end_min: 1095,
    });
    const m = saveMutation(d, 4, '2026-10-26', ids) as Mutation;
    const get = (e: Parameters<typeof store.getRow>[0], id: string) => store.getRow(e, id);
    await store.upsertRows(await localEffects(m, get));
    const once = JSON.stringify((await store.load()).schedule.routineBlocks);
    await store.upsertRows(await localEffects(m, get));
    expect(JSON.stringify((await store.load()).schedule.routineBlocks)).toBe(once);
    expect((await store.getRow('routine_block', GYM_MON))?.version).toBe(2);
  });
  it("copy keeps protected blocks (classes) on the target days and doesn't copy the source's", async () => {
    const { data } = await setup();
    let d = baseWeek(data.schedule, ROUTINE);
    d = addBlock(d, 1, { title: 'Lecture', start_min: 600, end_min: 700, category_id: CLASS }, ids);
    d = addBlock(
      d,
      1,
      { title: 'Tuesday study', start_min: 800, end_min: 860, category_id: STUDY },
      ids,
    );
    d = addBlock(
      d,
      0,
      { title: 'Monday lecture', start_min: 480, end_min: 540, category_id: CLASS },
      ids,
    );
    const r = copyDay(d, 0, [1], ids, new Set([CLASS]));
    expect(r.draft.days[1]!.map((b) => b.title)).toEqual([
      'Advanced Networking I',
      'Lecture',
      'Lunch',
      'Gym',
    ]);
  });
});
