import type { PlanChange, ScheduleData } from '@dialed/schedule';
import { describe, expect, it } from 'vitest';
import { seedData } from '../../schedule/test/seed';
import { validate, type ValidateContext } from '../src/validate';

const TODAY = '2026-10-20'; // bible-study.json test_clock

function ctx(data: ScheduleData, over: Partial<ValidateContext> = {}): ValidateContext {
  return { data, today: TODAY, source: 'in_app', ...over };
}

describe('validate — bible-study fixture (build seed)', () => {
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

  it('passes with no errors, non-empty ops, and flags the Dec 23/30 gap as outside_term', () => {
    const result = validate(
      { request_text: 'Bible study with Chichi every Wednesday at 7', changes },
      ctx(data),
    );
    expect(result.errors).toEqual([]);
    expect(result.ops.length).toBeGreaterThan(0);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: 'outside_term', passed: false }),
    );
  });
});

describe('validate — hard errors', () => {
  function base(): ScheduleData {
    return {
      categories: [
        {
          id: 'work',
          name: 'Study',
          group_name: 'School',
          color_dark: '#000',
          color_light: '#FFF',
          weight: 0.75,
          quiet: false,
          protected: false,
          sort: 0,
        },
        {
          id: 'class',
          name: 'Advanced Networking I',
          group_name: 'School',
          color_dark: '#000',
          color_light: '#FFF',
          weight: 0.75,
          quiet: false,
          protected: true,
          sort: 1,
        },
      ],
      terms: [
        {
          id: 't',
          name: 'Fall term',
          starts_on: '2026-09-14',
          ends_on: '2026-12-11',
          is_draft: false,
        },
      ],
      routines: [{ id: 'r', term_id: 't', name: 'Fall term' }],
      routineBlocks: [
        {
          id: 'mon-study',
          routine_id: 'r',
          weekday: 0,
          start_min: 600,
          end_min: 660,
          title: 'Study block',
          category_id: 'work',
          effective_from: '2026-09-14',
          effective_to: null,
        },
        {
          id: 'mon-class',
          routine_id: 'r',
          weekday: 0,
          start_min: 780,
          end_min: 840,
          title: 'Advanced Networking I',
          category_id: 'class',
          effective_from: '2026-09-14',
          effective_to: null,
        },
      ],
      overrides: [],
    };
  }

  it('too_many_changes: more than 25 for an in_app plan', () => {
    const changes: PlanChange[] = Array.from({ length: 26 }, (_, i) => ({
      kind: 'create_category',
      title: `Cat ${i}`,
      new_category: { temp_id: `c${i}`, name: `Cat ${i}`, group: 'Life', palette: 'Mint' },
      note: 'n',
    }));
    const result = validate({ request_text: 'x', changes }, ctx(base()));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: -1, code: 'too_many_changes' }),
    );
  });

  it('range_too_long: a repeat spanning more than 120 days', () => {
    const changes: PlanChange[] = [
      {
        kind: 'new',
        title: 'X',
        category_id: 'work',
        repeat: { weekday: 'mon', from: '2026-10-21', until: '2027-04-01' },
        start: '08:00',
        end: '09:00',
        note: 'n',
      },
    ];
    const result = validate({ request_text: 'x', changes }, ctx(base()));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: -1, code: 'range_too_long' }),
    );
  });

  it('duplicate_change: the same skip listed twice', () => {
    const skip: PlanChange = {
      kind: 'skip',
      title: 'X',
      block_ref: 'mon-study',
      on_date: '2026-10-26',
      note: 'n',
    };
    const result = validate({ request_text: 'x', changes: [skip, { ...skip }] }, ctx(base()));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: 1, code: 'duplicate_change' }),
    );
  });

  it('unknown_block: a block_ref that doesn’t exist', () => {
    const changes: PlanChange[] = [
      { kind: 'removed', title: 'X', block_ref: 'nope', from: '2026-10-26', note: 'n' },
    ];
    const result = validate({ request_text: 'x', changes }, ctx(base()));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: 0, code: 'unknown_block' }),
    );
  });

  it('unknown_category: a category_id that is neither real nor a temp id', () => {
    const changes: PlanChange[] = [
      {
        kind: 'new',
        title: 'X',
        category_id: 'nope',
        on_date: '2026-10-26',
        start: '08:00',
        end: '09:00',
        note: 'n',
      },
    ];
    const result = validate({ request_text: 'x', changes }, ctx(base()));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: 0, code: 'unknown_category' }),
    );
  });

  it('bad_time: end at or before start', () => {
    const changes: PlanChange[] = [
      {
        kind: 'new',
        title: 'X',
        category_id: 'work',
        on_date: '2026-10-26',
        start: '09:00',
        end: '09:00',
        note: 'n',
      },
    ];
    const result = validate({ request_text: 'x', changes }, ctx(base()));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: 0, code: 'bad_time' }),
    );
  });

  it('bad_time: a one-off date that already passed', () => {
    const changes: PlanChange[] = [
      { kind: 'skip', title: 'X', block_ref: 'mon-study', on_date: '2026-10-19', note: 'n' },
    ];
    const result = validate({ request_text: 'x', changes }, ctx(base()));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: 0, code: 'bad_time' }),
    );
  });

  it('protected_block: moving a class without naming it', () => {
    const changes: PlanChange[] = [
      {
        kind: 'moved',
        title: 'Advanced Networking I',
        block_ref: 'mon-class',
        on_date: '2026-10-26',
        to_date: '2026-10-27',
        note: 'n',
      },
    ];
    const result = validate(
      { request_text: 'Move my Monday study block earlier', changes },
      ctx(base()),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: 0, code: 'protected_block' }),
    );
  });

  it('protected_block is skipped when the request names the class', () => {
    const changes: PlanChange[] = [
      {
        kind: 'moved',
        title: 'Advanced Networking I',
        block_ref: 'mon-class',
        on_date: '2026-10-26',
        to_date: '2026-10-27',
        note: 'n',
      },
    ];
    const result = validate(
      { request_text: 'Move Advanced Networking I to Tuesday this week', changes },
      ctx(base()),
    );
    expect(result.errors).toEqual([]);
  });

  it('overlap: a new block clashing with an existing work block', () => {
    const changes: PlanChange[] = [
      {
        kind: 'new',
        title: 'X',
        category_id: 'work',
        on_date: '2026-10-19',
        start: '10:30',
        end: '11:30',
        note: 'n',
      },
    ];
    const result = validate({ request_text: 'x', changes }, ctx(base(), { today: '2026-10-18' }));
    expect(result.errors).toContainEqual(
      expect.objectContaining({ change_index: -1, code: 'overlap' }),
    );
  });
});

describe('validate — soft checks (never block approval)', () => {
  function base(): ScheduleData {
    return {
      categories: [
        {
          id: 'work',
          name: 'Study',
          group_name: 'School',
          color_dark: '#000',
          color_light: '#FFF',
          weight: 0.75,
          quiet: false,
          protected: false,
          sort: 0,
        },
      ],
      terms: [
        { id: 't', name: 'T', starts_on: '2026-09-14', ends_on: '2026-12-11', is_draft: false },
      ],
      routines: [{ id: 'r', term_id: 't', name: 'T' }],
      routineBlocks: [],
      overrides: [],
    };
  }

  it('day_bounds flags a block outside the profile day', () => {
    const changes: PlanChange[] = [
      {
        kind: 'new',
        title: 'Late night',
        category_id: 'work',
        on_date: '2026-10-26',
        start: '23:00',
        end: '23:30',
        note: 'n',
      },
    ];
    const result = validate(
      { request_text: 'x', changes },
      ctx(base(), {
        profile: { day_start_min: 540, day_end_min: 1380, quiet_start_min: 0, quiet_end_min: 540 },
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: 'day_bounds', passed: false }),
    );
  });

  it('quiet_hours flags a work block landing inside quiet hours', () => {
    const changes: PlanChange[] = [
      {
        kind: 'new',
        title: 'Early call',
        category_id: 'work',
        on_date: '2026-10-26',
        start: '05:30',
        end: '06:30',
        note: 'n',
      },
    ];
    const result = validate(
      { request_text: 'x', changes },
      ctx(base(), {
        profile: { day_start_min: 0, day_end_min: 1440, quiet_start_min: 0, quiet_end_min: 540 },
      }),
    );
    expect(result.errors).toEqual([]);
    expect(result.checks).toContainEqual(
      expect.objectContaining({ id: 'quiet_hours', passed: false }),
    );
  });

  it('a plain plan with no violations produces no checks', () => {
    const changes: PlanChange[] = [
      {
        kind: 'new',
        title: 'Gym',
        category_id: 'work',
        on_date: '2026-10-26',
        start: '10:00',
        end: '11:00',
        note: 'n',
      },
    ];
    const result = validate({ request_text: 'x', changes }, ctx(base()));
    expect(result.errors).toEqual([]);
    expect(result.checks).toEqual([]);
  });
});
