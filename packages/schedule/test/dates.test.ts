import { describe, expect, it } from 'vitest';
import { addDays, isoWeekNumber, localNow, weekdayOf, weekStartOf, isIsoDate } from '../src';

describe('dates', () => {
  it('weekday Monday = 0', () => {
    expect(weekdayOf('2026-10-19')).toBe(0);
    expect(weekdayOf('2026-10-25')).toBe(6);
  });
  it('week math', () => {
    expect(weekStartOf('2026-10-22')).toBe('2026-10-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(isoWeekNumber('2026-10-19')).toBe(43);
    expect(isIsoDate('2026-02-30')).toBe(false);
  });
  it('localNow uses the zone (TEST_NOW 2026-10-20 12:00 America/Toronto)', () => {
    expect(localNow(new Date('2026-10-20T16:00:00Z'), 'America/Toronto')).toEqual({
      date: '2026-10-20',
      minute: 720,
    });
  });
});
