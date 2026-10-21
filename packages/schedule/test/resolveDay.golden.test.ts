import { describe, expect, it } from 'vitest';
import { resolveDay, weekWorkMinutes, workMinutes, hoursTenths, formatHours } from '../src';
import { seedData } from './seed';

const data = seedData();

describe('resolveDay — seeded owner (golden)', () => {
  it('resolveDay(2026-10-19) returns 11 blocks with Sermon Sync 12:40–14:30', () => {
    const day = resolveDay('2026-10-19', data);
    expect(day.blocks).toHaveLength(11);
    const sermon = day.blocks.find((b) => b.title === 'Sermon Sync');
    expect(sermon).toMatchObject({ start_min: 760, end_min: 870, source: 'routine' });
    expect(day.blocks.map((b) => b.start_min)).toEqual(
      [...day.blocks.map((b) => b.start_min)].sort((a, b) => a - b),
    );
  });

  it('owner week of Oct 19 = 64.25 h of work, displayed 64.3 h', () => {
    const min = weekWorkMinutes('2026-10-19', data);
    expect(min).toBe(64.25 * 60);
    expect(hoursTenths(min)).toBe(643);
    expect(formatHours(min)).toBe('64.3h');
  });

  it('Thanksgiving Oct 12 = 2h Sermon Sync only', () => {
    const day = resolveDay('2026-10-12', data);
    expect(day.blocks.map((b) => [b.title, b.start_min, b.end_min, b.source])).toEqual([
      ['Sermon Sync', 780, 900, 'one_off'],
    ]);
    expect(workMinutes(day.blocks)).toBe(120);
  });

  it('meals and breaks are quiet and excluded from totals', () => {
    const day = resolveDay('2026-10-19', data);
    const quiet = day.blocks.filter((b) => b.quiet).map((b) => b.title);
    expect(quiet).toEqual(expect.arrayContaining(['Breakfast', 'Lunch', 'Break', 'Dinner']));
    const all = day.blocks.reduce((s, b) => s + b.end_min - b.start_min, 0);
    const quietMin = day.blocks
      .filter((b) => b.quiet)
      .reduce((s, b) => s + b.end_min - b.start_min, 0);
    expect(workMinutes(day.blocks)).toBe(all - quietMin);
  });

  it('dates outside every term have no routine blocks; draft terms are excluded', () => {
    expect(resolveDay('2026-12-25', data).blocks).toEqual([]);
    expect(resolveDay('2027-01-11', data).term_id).toBeNull();
  });
});
