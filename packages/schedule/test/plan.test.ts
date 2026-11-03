import { describe, expect, it } from 'vitest';
import { applyOps, formatHours, planImpact, planOps, resolveDay, weekWorkMinutes } from '../src';
import type { PlanChange } from '../src/plan';
import type { ScheduleData } from '../src/types';
import { seedData } from './seed';

const TODAY = '2026-10-20'; // bible-study.json test_clock, America/Toronto date

function cat(id: string, over: Partial<ScheduleData['categories'][number]> = {}) {
  return {
    id,
    name: id,
    group_name: 'G',
    color_dark: '#000000',
    color_light: '#FFFFFF',
    weight: 0.75,
    quiet: false,
    protected: false,
    sort: 0,
    ...over,
  };
}

describe('planOps + applyOps + planImpact — bible-study fixture (build seed)', () => {
  const data = seedData();
  const wellServicesWed = data.routineBlocks.find(
    (b) => b.title === 'WellServices' && b.weekday === 2,
  )!;
  const speedwatchFri = data.routineBlocks.find(
    (b) => b.title === 'Speedwatch Ontario' && b.weekday === 4,
  )!;

  const changes: PlanChange[] = [
    {
      kind: 'create_category',
      title: 'Bible study',
      new_category: { temp_id: 'c1', name: 'Bible study', group: 'Life', palette: 'Mint' },
      note: 'New category: Bible study, in Life.',
    },
    {
      kind: 'new',
      title: 'Bible study with Chichi',
      category_id: 'c1',
      repeat: { weekday: 'wed', from: '2026-10-21', until: '2026-12-31' },
      start: '19:00',
      end: '20:30',
      note: 'Every Wednesday, Oct 21 to Dec 31.',
    },
    {
      kind: 'moved',
      title: 'WellServices',
      block_ref: wellServicesWed.id,
      repeat: { weekday: 'sun', from: '2026-10-25', until: '2026-12-11' },
      to_weekday: 'sun',
      start: '15:00',
      end: '16:45',
      note: 'Makes room for Bible study on Wednesday.',
      close_from: '2026-10-21',
    },
    {
      kind: 'moved',
      title: 'Speedwatch Ontario',
      block_ref: speedwatchFri.id,
      repeat: { weekday: 'sat', from: '2026-10-24', until: '2026-12-11' },
      to_weekday: 'sat',
      start: '17:30',
      end: '18:45',
      note: 'Right after Saturday gym.',
      close_from: '2026-10-23',
    },
  ];

  const ops = planOps(changes, data, TODAY);
  const after = applyOps(data, ops);

  it('matches the expected before/after hours (half-up to 0.1 h)', () => {
    expect(formatHours(weekWorkMinutes('2026-10-26', data))).toBe('64.3h');
    expect(formatHours(weekWorkMinutes('2026-10-26', after))).toBe('65.8h');
    const wedBefore = resolveDay('2026-10-28', data).blocks;
    const wedAfter = resolveDay('2026-10-28', after).blocks;
    expect(
      formatHours(
        wedBefore.filter((b) => !b.quiet).reduce((s, b) => s + b.end_min - b.start_min, 0),
      ),
    ).toBe('11.6h');
    expect(
      formatHours(
        wedAfter.filter((b) => !b.quiet).reduce((s, b) => s + b.end_min - b.start_min, 0),
      ),
    ).toBe('11.3h');
  });

  it('planImpact reports Wednesday (gains Bible study), Weekend and Week — Friday also moves since Speedwatch leaves it', () => {
    const rows = planImpact(data, after, '2026-10-26');
    expect(rows).toContainEqual({ label: 'Wednesday', before: '11.6h', after: '11.3h' });
    expect(rows).toContainEqual({ label: 'Weekend', before: '8.5h', after: '11.5h' });
    expect(rows).toContainEqual({ label: 'Week', before: '64.3h', after: '65.8h' });
    expect(rows.map((r) => r.label)).toEqual(['Wednesday', 'Friday', 'Weekend', 'Week']);
    // Unaffected weekdays (Monday, Tuesday, Thursday) never get a row.
    expect(rows.some((r) => ['Monday', 'Tuesday', 'Thursday'].includes(r.label))).toBe(false);
  });

  it('the Bible study block splits across Fall term and Exam weeks, skipping the Dec 23–31 gap', () => {
    expect(
      resolveDay('2026-10-21', after).blocks.some((b) => b.title === 'Bible study with Chichi'),
    ).toBe(true);
    expect(
      resolveDay('2026-12-16', after).blocks.some((b) => b.title === 'Bible study with Chichi'),
    ).toBe(true); // Wed inside Exam weeks
    expect(
      resolveDay('2026-12-23', after).blocks.some((b) => b.title === 'Bible study with Chichi'),
    ).toBe(false); // Wed with no covering term
    expect(
      resolveDay('2026-12-30', after).blocks.some((b) => b.title === 'Bible study with Chichi'),
    ).toBe(false);
  });

  it('close_from ends the old row exactly there, independent of the move-to date', () => {
    expect(resolveDay('2026-10-14', after).blocks.some((b) => b.title === 'WellServices')).toBe(
      true,
    );
    expect(resolveDay('2026-10-21', after).blocks.some((b) => b.title === 'WellServices')).toBe(
      false,
    );
    expect(resolveDay('2026-10-25', after).blocks.some((b) => b.title === 'WellServices')).toBe(
      true,
    );
  });
});

describe('planOps — one-off kinds', () => {
  function base(): ScheduleData {
    return {
      categories: [cat('work'), cat('meal', { quiet: true })],
      terms: [
        { id: 't', name: 'T', starts_on: '2026-09-14', ends_on: '2026-12-11', is_draft: false },
      ],
      routines: [{ id: 'r', term_id: 't', name: 'T' }],
      routineBlocks: [
        {
          id: 'a',
          routine_id: 'r',
          weekday: 0,
          start_min: 600,
          end_min: 660,
          title: 'A',
          category_id: 'work',
          effective_from: '2026-09-14',
          effective_to: null,
        },
      ],
      overrides: [],
    };
  }

  it('new + on_date adds a one-off block', () => {
    const change: PlanChange = {
      kind: 'new',
      title: 'Dentist',
      category_id: 'work',
      on_date: '2026-10-22',
      start: '09:00',
      end: '10:00',
      note: 'n',
    };
    const after = applyOps(base(), planOps([change], base(), '2026-10-20'));
    expect(
      resolveDay('2026-10-22', after).blocks.map((b) => [b.title, b.start_min, b.end_min]),
    ).toEqual([['Dentist', 540, 600]]);
  });

  it('moved + on_date removes the block that day and re-adds it on to_date', () => {
    const change: PlanChange = {
      kind: 'moved',
      title: 'A',
      block_ref: 'a',
      on_date: '2026-10-19',
      to_date: '2026-10-21',
      start: '15:00',
      end: '16:00',
      note: 'n',
    };
    const after = applyOps(base(), planOps([change], base(), '2026-10-18'));
    expect(resolveDay('2026-10-19', after).blocks).toEqual([]);
    expect(
      resolveDay('2026-10-21', after).blocks.map((b) => [b.title, b.start_min, b.end_min]),
    ).toEqual([['A', 900, 960]]);
  });

  it('changed + on_date modifies just that occurrence', () => {
    const change: PlanChange = {
      kind: 'changed',
      title: 'A',
      block_ref: 'a',
      on_date: '2026-10-19',
      fields: { start: '07:00' },
      note: 'n',
    };
    const after = applyOps(base(), planOps([change], base(), '2026-10-18'));
    expect(resolveDay('2026-10-19', after).blocks.map((b) => [b.title, b.start_min])).toEqual([
      ['A', 420],
    ]);
    expect(resolveDay('2026-10-26', after).blocks.map((b) => [b.title, b.start_min])).toEqual([
      ['A', 600],
    ]);
  });

  it('changed + from closes the old row and opens a new one keeping the same weekday', () => {
    const change: PlanChange = {
      kind: 'changed',
      title: 'A',
      block_ref: 'a',
      from: '2026-10-26',
      fields: { start: '07:00', end: '08:00' },
      note: 'n',
    };
    const after = applyOps(base(), planOps([change], base(), '2026-10-20'));
    expect(resolveDay('2026-10-19', after).blocks.map((b) => [b.title, b.start_min])).toEqual([
      ['A', 600],
    ]);
    expect(resolveDay('2026-10-26', after).blocks.map((b) => [b.title, b.start_min])).toEqual([
      ['A', 420],
    ]);
  });

  it('removed closes the routine block from the given date', () => {
    const change: PlanChange = {
      kind: 'removed',
      title: 'A',
      block_ref: 'a',
      from: '2026-10-26',
      note: 'n',
    };
    const after = applyOps(base(), planOps([change], base(), '2026-10-20'));
    expect(resolveDay('2026-10-19', after).blocks).toHaveLength(1);
    expect(resolveDay('2026-10-26', after).blocks).toHaveLength(0);
  });

  it('skip removes just that occurrence', () => {
    const change: PlanChange = {
      kind: 'skip',
      title: 'A',
      block_ref: 'a',
      on_date: '2026-10-19',
      note: 'n',
    };
    const after = applyOps(base(), planOps([change], base(), '2026-10-18'));
    expect(resolveDay('2026-10-19', after).blocks).toEqual([]);
    expect(resolveDay('2026-10-26', after).blocks).toHaveLength(1);
  });

  it('removed/changed "from" also clamps to tomorrow — past days never change (D-06)', () => {
    // block 'a' is weekday 0 (Monday): 2026-10-19 is the Monday before "today", 2026-10-26 the one after.
    const removed: PlanChange = {
      kind: 'removed',
      title: 'A',
      block_ref: 'a',
      from: '2026-10-01',
      note: 'n',
    };
    const afterRemoved = applyOps(base(), planOps([removed], base(), '2026-10-20'));
    expect(resolveDay('2026-10-19', afterRemoved).blocks).toHaveLength(1);
    expect(resolveDay('2026-10-26', afterRemoved).blocks).toHaveLength(0);

    const changed: PlanChange = {
      kind: 'changed',
      title: 'A',
      block_ref: 'a',
      from: '2026-10-01',
      fields: { start: '07:00' },
      note: 'n',
    };
    const afterChanged = applyOps(base(), planOps([changed], base(), '2026-10-20'));
    expect(resolveDay('2026-10-19', afterChanged).blocks.map((b) => b.start_min)).toEqual([600]);
    expect(resolveDay('2026-10-26', afterChanged).blocks.map((b) => b.start_min)).toEqual([420]);
  });

  it('a repeat.from before tomorrow clamps to tomorrow', () => {
    const change: PlanChange = {
      kind: 'new',
      title: 'B',
      category_id: 'work',
      repeat: { weekday: 'mon', from: '2026-10-01', until: '2026-12-11' },
      start: '08:00',
      end: '09:00',
      note: 'n',
    };
    const after = applyOps(base(), planOps([change], base(), '2026-10-20'));
    // 2026-10-19 is a Monday before the clamp (tomorrow = 2026-10-21); the new block must not appear there.
    expect(resolveDay('2026-10-19', after).blocks.some((b) => b.title === 'B')).toBe(false);
    expect(resolveDay('2026-10-26', after).blocks.some((b) => b.title === 'B')).toBe(true);
  });
});
