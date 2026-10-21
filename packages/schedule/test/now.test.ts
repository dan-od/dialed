import { describe, expect, it } from 'vitest';
import {
  effectiveFrom,
  formatClock,
  formatCountdown,
  formatDuration,
  formatRange,
  nowState,
  percentOfDayGone,
  resolveDay,
  restOfToday,
} from '../src';
import { seedData } from './seed';

const mon = resolveDay('2026-10-19', seedData()).blocks;

describe('hero state at the Flow 03 clock points (Mon Oct 19)', () => {
  it('795 min (1:15 pm): in Sermon Sync, 1:15 left, ends 2:30 pm', () => {
    const s = nowState(mon, 795);
    expect(s.kind).toBe('in');
    if (s.kind !== 'in') return;
    expect(s.block.title).toBe('Sermon Sync');
    expect(formatCountdown(s.remaining)).toBe('1:15');
    expect(formatClock(s.block.end_min)).toBe('2:30 pm');
  });
  it('1220 min is between or in a block; 1410 min is done or late block', () => {
    expect(['in', 'next']).toContain(nowState(mon, 1220).kind);
    const last = mon[mon.length - 1]!;
    expect(nowState(mon, last.end_min).kind).toBe('done');
  });
  it('no blocks → free', () => {
    expect(nowState([], 600).kind).toBe('free');
  });
  it('rest of today lists blocks not yet started (prototype: 6 at 1:15 pm, 1 at 8:20 pm, 0 at 11:30 pm)', () => {
    expect(restOfToday(mon, 795).map((b) => b.title)[0]).toBe('Break');
    expect(restOfToday(mon, 795)).toHaveLength(6);
  });
  it('percent of day gone', () => {
    expect(percentOfDayGone(795, 540, 1440)).toBe(28);
  });
});

describe('formats', () => {
  it('clock and durations', () => {
    expect(formatClock(540)).toBe('9:00 am');
    expect(formatClock(1440)).toBe('12:00 am');
    expect(formatClock(720)).toBe('12:00 pm');
    expect(formatRange(760, 870)).toBe('12:40–2:30');
    expect(formatDuration(110)).toBe('1h 50m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatCountdown(5)).toBe('0:05');
  });
});

describe('effectiveFrom', () => {
  it('routine editor → next Monday; plans clamp to tomorrow; imports → term start or tomorrow', () => {
    expect(effectiveFrom({ kind: 'routine_editor', today: '2026-10-20' })).toBe('2026-10-26');
    expect(effectiveFrom({ kind: 'plan_repeat', today: '2026-10-20', from: '2026-10-19' })).toBe(
      '2026-10-21',
    );
    expect(effectiveFrom({ kind: 'import', today: '2026-10-20', termStart: '2026-09-14' })).toBe(
      '2026-10-21',
    );
    expect(effectiveFrom({ kind: 'edit_every', occurrence: '2026-10-20' })).toBe('2026-10-20');
  });
});
