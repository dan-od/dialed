import type { Mutation } from '@dialed/contracts';
import { localEffects } from '../data/shape';
import { MemoryStore } from '../data/memoryStore';
import { Categories } from '../settings/service';

// Flow 09 on the phone: merge and delete show at once (offline too), mirroring the server
// (apps/api categoryMerge / categoryDelete); re-applying on top of a pull gives the same rows.
jest.mock('../clock/clock', () => ({ now: () => ({ date: '2026-10-23', minute: 795 }) }));

const cat = (id: string, name: string, version = 1) => ({
  id,
  name,
  group_name: 'Projects',
  color_dark: '#FF8F8F',
  color_light: '#D94141',
  weight: 1,
  quiet: false,
  protected: false,
  sort: 0,
  deleted_at: null,
  version,
});
const rb = (id: string, category_id: string, effective_from = '2026-09-14') => ({
  id,
  routine_id: 'r',
  weekday: 1,
  start_min: 900,
  end_min: 990,
  title: id,
  category_id,
  effective_from,
  effective_to: null,
  deleted_at: null,
  version: 1,
});
const ov = (id: string, on_date: string) => ({
  id,
  on_date,
  kind: 'add',
  routine_block_id: null,
  title: 'Call',
  start_min: 600,
  end_min: 660,
  category_id: 'speed',
  moved_to_date: null,
  note: null,
  deleted_at: null,
  version: 1,
});

async function setup() {
  const store = new MemoryStore();
  await store.replaceAll(
    [
      {
        entity: 'profile',
        op: 'upsert',
        row: { id: 'me', time_zone: 'America/Toronto', version: 3 },
      },
      { entity: 'category', op: 'upsert', row: cat('speed', 'Speedwatch Ontario') },
      { entity: 'category', op: 'upsert', row: cat('well', 'WellServices', 4) },
      { entity: 'routine_block', op: 'upsert', row: rb('a', 'speed') },
      { entity: 'routine_block', op: 'upsert', row: rb('b', 'speed') },
      { entity: 'routine_block', op: 'upsert', row: rb('later', 'speed', '2026-10-26') },
      { entity: 'routine_block', op: 'upsert', row: rb('w', 'well') },
      { entity: 'override', op: 'upsert', row: ov('past', '2026-10-12') },
      { entity: 'override', op: 'upsert', row: ov('future', '2026-10-24') },
    ],
    10,
  );
  const sent: Mutation[] = [];
  const enqueue = async (m: Mutation) => {
    sent.push(m);
    await store.upsertRows(await effects(m));
  };
  const effects = (m: Mutation) =>
    localEffects(
      m,
      (e, id) => store.getRow(e, id),
      (e) => store.rows(e),
    );
  let n = 0;
  const cats = new Categories(store, enqueue, () => `00000000-0000-4000-8000-00000000000${n++}`);
  const get = async (e: 'category' | 'routine_block' | 'override', id: string) =>
    (await store.getRow(e, id))!;
  return { store, sent, cats, get, effects };
}

describe('merge on the phone', () => {
  it('moves every block and one-off, removes the category, and sends one category_merge', async () => {
    const { sent, cats, get, effects, store } = await setup();
    const r = await cats.merge('speed', 'well');
    expect(r).toMatchObject({ ok: true, moved: 3, mutationId: sent[0]!.client_mutation_id });
    expect(sent[0]).toMatchObject({
      entity: 'category_merge',
      from: 'speed',
      to: 'well',
      from_version: 1,
      to_version: 4,
    });
    for (const id of ['a', 'b', 'later'])
      expect((await get('routine_block', id)).category_id).toBe('well');
    expect((await get('override', 'past')).category_id).toBe('well');
    expect((await get('category', 'speed')).deleted_at).not.toBeNull();
    // Re-applied after a pull (rebase): same rows.
    const before = JSON.stringify([...store.tables.get('routine_block')!.values()]);
    await store.upsertRows(await effects(sent[0]!));
    expect(JSON.stringify([...store.tables.get('routine_block')!.values()])).toBe(before);
  });
  it('Undo sends category_unmerge once the merge is known to the server', async () => {
    const { sent, cats, store } = await setup();
    await cats.merge('speed', 'well');
    expect(await cats.unmerge(sent[0]!.client_mutation_id)).toBe('not_synced');
    await store.setMeta(
      `merge:${sent[0]!.client_mutation_id}`,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(await cats.unmerge(sent[0]!.client_mutation_id)).toBe('sent');
    expect(sent[1]).toMatchObject({
      entity: 'category_unmerge',
      merge_id: '11111111-1111-4111-8111-111111111111',
    });
  });
});

describe('delete on the phone', () => {
  it('moves blocks to the picked category', async () => {
    const { sent, cats, get } = await setup();
    await cats.remove('speed', { reassignTo: 'well' });
    expect(sent[0]).toMatchObject({ entity: 'category_delete', id: 'speed', reassign_to: 'well' });
    expect((await get('routine_block', 'a')).category_id).toBe('well');
    expect((await get('category', 'speed')).deleted_at).not.toBeNull();
  });
  it('"Delete those blocks too" ends them from today; past days keep theirs', async () => {
    const { sent, cats, get } = await setup();
    await cats.remove('speed', { deleteBlocks: true });
    expect(sent[0]).toMatchObject({ entity: 'category_delete', delete_blocks: true });
    expect((await get('routine_block', 'a')).effective_to).toBe('2026-10-23');
    expect((await get('routine_block', 'later')).deleted_at).not.toBeNull();
    expect((await get('override', 'past')).deleted_at).toBeNull();
    expect((await get('override', 'future')).deleted_at).not.toBeNull();
  });
  it('save keeps the colours when the palette has none picked and checks names', async () => {
    const { sent, cats } = await setup();
    expect(await cats.save('speed', { name: '  ', group: 'Projects', colour: -1 })).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(
      await cats.save('speed', { name: 'wellservices', group: 'Projects', colour: -1 }),
    ).toEqual({
      ok: false,
      reason: 'taken',
      message: 'You already have a category called WellServices.',
    });
    await cats.save('speed', { name: ' Speedwatch  ON ', group: 'Life', colour: -1 });
    expect(sent[0]).toMatchObject({
      entity: 'category',
      op: 'upsert',
      id: 'speed',
      base_version: 1,
      fields: {
        name: 'Speedwatch ON',
        group_name: 'Life',
        color_dark: '#FF8F8F',
        color_light: '#D94141',
      },
    });
    expect((sent[0] as { fields: object }).fields).not.toHaveProperty('quiet');
    await cats.save('speed', { name: 'Speedwatch', group: 'Life', colour: 0, quiet: true });
    expect(sent[1]).toMatchObject({
      fields: { color_dark: '#FF5A1F', color_light: '#E8480F', quiet: true },
    });
  });
});
