import { describe, expect, it } from 'vitest';
import { resolveDay } from '../src';
import type { ScheduleData } from '../src/types';

const cat = (id: string, quiet = false) => ({
  id,
  name: id,
  group_name: 'G',
  color_dark: '#000000',
  color_light: '#FFFFFF',
  weight: 0.5,
  quiet,
  protected: false,
  sort: 0,
});

function base(): ScheduleData {
  return {
    categories: [cat('work'), cat('meal', true)],
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
        effective_to: '2026-10-26',
      },
      {
        id: 'a2',
        routine_id: 'r',
        weekday: 0,
        start_min: 615,
        end_min: 675,
        title: 'A',
        category_id: 'work',
        effective_from: '2026-10-26',
        effective_to: null,
      },
      {
        id: 'b',
        routine_id: 'r',
        weekday: 0,
        start_min: 720,
        end_min: 760,
        title: 'Lunch',
        category_id: 'meal',
        effective_from: '2026-09-14',
        effective_to: null,
      },
      {
        id: 'gone',
        routine_id: 'r',
        weekday: 0,
        start_min: 800,
        end_min: 860,
        title: 'Gone',
        category_id: 'work',
        effective_from: '2026-09-14',
        effective_to: null,
        deleted_at: '2026-09-15T00:00:00Z',
      },
    ],
    overrides: [],
  };
}

describe('resolveDay rules', () => {
  it('effective dates: past days keep the old row, later days use the new row', () => {
    expect(resolveDay('2026-10-19', base()).blocks.map((b) => b.routine_block_id)).toEqual([
      'a',
      'b',
    ]);
    expect(resolveDay('2026-10-26', base()).blocks.map((b) => b.routine_block_id)).toEqual([
      'a2',
      'b',
    ]);
  });

  it('term edges are inclusive', () => {
    expect(resolveDay('2026-09-14', base()).blocks).toHaveLength(2);
    expect(resolveDay('2026-12-07', base()).blocks).toHaveLength(2);
    expect(resolveDay('2026-12-14', base()).blocks).toHaveLength(0);
  });

  it('modify replaces fields, skip removes, add inserts', () => {
    const d = base();
    d.overrides = [
      {
        id: 'o1',
        on_date: '2026-10-19',
        kind: 'modify',
        routine_block_id: 'a',
        title: 'A late',
        start_min: 630,
        end_min: 690,
        category_id: null,
        moved_to_date: null,
        note: null,
      },
      {
        id: 'o2',
        on_date: '2026-10-19',
        kind: 'skip',
        routine_block_id: 'b',
        title: null,
        start_min: null,
        end_min: null,
        category_id: null,
        moved_to_date: null,
        note: null,
      },
      {
        id: 'o3',
        on_date: '2026-10-19',
        kind: 'add',
        routine_block_id: null,
        title: 'Extra',
        start_min: 540,
        end_min: 570,
        category_id: 'work',
        moved_to_date: null,
        note: null,
      },
    ];
    const day = resolveDay('2026-10-19', d);
    expect(day.blocks.map((b) => [b.title, b.start_min, b.end_min, b.source])).toEqual([
      ['Extra', 540, 570, 'one_off'],
      ['A late', 630, 690, 'routine'],
    ]);
  });

  it('move removes the block here and adds it on moved_to_date', () => {
    const d = base();
    d.overrides = [
      {
        id: 'm',
        on_date: '2026-10-19',
        kind: 'move',
        routine_block_id: 'a',
        title: null,
        start_min: 900,
        end_min: 960,
        category_id: null,
        moved_to_date: '2026-10-21',
        note: null,
      },
    ];
    expect(resolveDay('2026-10-19', d).blocks.map((b) => b.title)).toEqual(['Lunch']);
    const wed = resolveDay('2026-10-21', d);
    expect(wed.blocks.map((b) => [b.title, b.start_min, b.end_min, b.key])).toEqual([
      ['A', 900, 960, 'm:2026-10-21'],
    ]);
  });

  it('deleted overrides are ignored; add overrides apply even outside terms', () => {
    const d = base();
    d.overrides = [
      {
        id: 'x',
        on_date: '2026-10-19',
        kind: 'skip',
        routine_block_id: 'a',
        title: null,
        start_min: null,
        end_min: null,
        category_id: null,
        moved_to_date: null,
        note: null,
        deleted_at: '2026-10-01T00:00:00Z',
      },
      {
        id: 'y',
        on_date: '2026-12-25',
        kind: 'add',
        routine_block_id: null,
        title: 'Xmas',
        start_min: 600,
        end_min: 660,
        category_id: 'work',
        moved_to_date: null,
        note: null,
      },
    ];
    expect(resolveDay('2026-10-19', d).blocks).toHaveLength(2);
    expect(resolveDay('2026-12-25', d).blocks.map((b) => b.title)).toEqual(['Xmas']);
  });

  it('DST day (Nov 1 2026, Toronto) keeps wall-clock minutes', () => {
    const d = base();
    d.routineBlocks.push({
      id: 's',
      routine_id: 'r',
      weekday: 6,
      start_min: 120,
      end_min: 180,
      title: 'Night',
      category_id: 'work',
      effective_from: '2026-09-14',
      effective_to: null,
    });
    expect(resolveDay('2026-11-01', d).blocks.map((b) => [b.start_min, b.end_min])).toEqual([
      [120, 180],
    ]);
  });
});
