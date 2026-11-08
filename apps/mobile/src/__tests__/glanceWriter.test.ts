import { DEFAULT_DEVICE_PREFS } from '@dialed/contracts';
import type { Override, ScheduleData } from '@dialed/schedule';
import { SnapshotWriter, type GlanceNative } from '../glance/writer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const TZ = 'America/Toronto';
const now = new Date('2037-10-19T17:15:00.000Z'); // Mon 1:15 pm

function fakeNative() {
  return {
    writeSnapshot: jest.fn<Promise<void>, [string]>(async () => {}),
    clearSnapshot: jest.fn<Promise<void>, []>(async () => {}),
    reloadTimelines: jest.fn<Promise<void>, []>(async () => {}),
  } satisfies GlanceNative;
}

const addOn = (data: ScheduleData, on_date: string, title: string): ScheduleData => {
  const o: Override = {
    id: `o-${on_date}`,
    on_date,
    kind: 'add',
    routine_block_id: null,
    title,
    start_min: 1340,
    end_min: 1400,
    category_id: data.categories.find((c) => !c.quiet)!.id,
    moved_to_date: null,
    note: null,
    deleted_at: null,
  };
  return { ...data, overrides: [...data.overrides, o] };
};

describe('SnapshotWriter (C-x08: write snapshot → reload timelines)', () => {
  it('writes the snapshot JSON then reloads timelines', async () => {
    const n = fakeNative();
    const w = new SnapshotWriter(n);
    expect(await w.write(seedData(), DEFAULT_DEVICE_PREFS, TZ, now)).toBe('written');
    expect(n.writeSnapshot).toHaveBeenCalledTimes(1);
    const json = JSON.parse(n.writeSnapshot.mock.calls[0]![0]);
    expect(json).toMatchObject({ version: 1, time_zone: TZ });
    expect(json.days[0].date).toBe('2037-10-19');
    expect(n.reloadTimelines).toHaveBeenCalledTimes(1);
    expect(n.writeSnapshot.mock.invocationCallOrder[0]!).toBeLessThan(
      n.reloadTimelines.mock.invocationCallOrder[0]!,
    );
  });

  it('a pulled change that touches today rewrites; identical data does not', async () => {
    const n = fakeNative();
    const w = new SnapshotWriter(n);
    const data = seedData();
    await w.write(data, DEFAULT_DEVICE_PREFS, TZ, now);
    expect(await w.write(data, DEFAULT_DEVICE_PREFS, TZ, new Date(now.getTime() + 60_000))).toBe(
      'unchanged',
    );
    const changed = addOn(data, '2037-10-19', 'Late call');
    expect(await w.write(changed, DEFAULT_DEVICE_PREFS, TZ, now)).toBe('written');
    const json = JSON.parse(n.writeSnapshot.mock.calls[1]![0]);
    expect(json.days[0].blocks.map((b: { title: string }) => b.title)).toContain('Late call');
    expect(n.reloadTimelines).toHaveBeenCalledTimes(2);
  });

  it('a change outside today, tomorrow and this week does not rewrite', async () => {
    const n = fakeNative();
    const w = new SnapshotWriter(n);
    const data = seedData();
    await w.write(data, DEFAULT_DEVICE_PREFS, TZ, now);
    expect(
      await w.write(addOn(data, '2037-11-16', 'Far away'), DEFAULT_DEVICE_PREFS, TZ, now),
    ).toBe('unchanged');
  });

  it('lock mode or line changes rewrite; force (foreground) always rewrites', async () => {
    const n = fakeNative();
    const w = new SnapshotWriter(n);
    const data = seedData();
    await w.write(data, DEFAULT_DEVICE_PREFS, TZ, now);
    expect(await w.write(data, { ...DEFAULT_DEVICE_PREFS, lock_mode: 'line' }, TZ, now)).toBe(
      'written',
    );
    expect(
      await w.write(data, { ...DEFAULT_DEVICE_PREFS, lock_mode: 'line' }, TZ, now, { force: true }),
    ).toBe('written');
    expect(n.writeSnapshot).toHaveBeenCalledTimes(3);
  });

  it('sign-out clears the snapshot and reloads (widgets say "Sign in to Dialed")', async () => {
    const n = fakeNative();
    const w = new SnapshotWriter(n);
    const data = seedData();
    await w.write(data, DEFAULT_DEVICE_PREFS, TZ, now);
    await w.clear();
    expect(n.clearSnapshot).toHaveBeenCalledTimes(1);
    expect(n.reloadTimelines).toHaveBeenCalledTimes(2);
    // The next account's first write is never skipped as "unchanged".
    expect(await w.write(data, DEFAULT_DEVICE_PREFS, TZ, now)).toBe('written');
  });

  it('a failed write is logged and retried on the next call', async () => {
    const n = fakeNative();
    n.writeSnapshot.mockRejectedValueOnce(new Error('disk'));
    const log = jest.fn();
    const w = new SnapshotWriter(n, log);
    const data = seedData();
    expect(await w.write(data, DEFAULT_DEVICE_PREFS, TZ, now)).toBe('failed');
    expect(log).toHaveBeenCalledWith('glance: snapshot write failed', expect.any(Error));
    expect(n.reloadTimelines).not.toHaveBeenCalled();
    expect(await w.write(data, DEFAULT_DEVICE_PREFS, TZ, now)).toBe('written');
  });

  it('no native module yet (before the widget target): a no-op', async () => {
    const w = new SnapshotWriter(null);
    expect(await w.write(seedData(), DEFAULT_DEVICE_PREFS, TZ, now)).toBe('unavailable');
    await expect(w.clear()).resolves.toBeUndefined();
  });
});
