import type { ScheduleData } from '@dialed/schedule';
import { instantAt, planReminders } from '../notifications/plan';

// Flow 04 per-block alerts (D-32): scheduled on this phone for the next 48 h, never in quiet hours,
// at most 6 a day (Flow 08 daily cap).
const TZ = 'America/Toronto';
const cat = {
  id: 'c',
  name: 'Gym',
  group_name: 'Life',
  color_dark: '#000000',
  color_light: '#000000',
  weight: 1,
  quiet: false,
  protected: false,
  sort: 0,
  deleted_at: null,
};
const data = (
  blocks: { id: string; weekday: number; start: number; end: number; title: string }[],
): ScheduleData => ({
  categories: [cat],
  terms: [
    {
      id: 't',
      name: 'Fall term',
      starts_on: '2026-09-14',
      ends_on: '2026-12-11',
      is_draft: false,
      deleted_at: null,
    },
  ],
  routines: [{ id: 'r', term_id: 't', name: 'Fall term' }],
  routineBlocks: blocks.map((b) => ({
    id: b.id,
    routine_id: 'r',
    weekday: b.weekday,
    start_min: b.start,
    end_min: b.end,
    title: b.title,
    category_id: 'c',
    effective_from: '2026-09-14',
    effective_to: null,
    deleted_at: null,
  })),
  overrides: [],
});
const quiet = { start: 0, end: 540 }; // 12 am – 9 am

describe('instantAt', () => {
  it('turns a local date + minute in the profile time zone into an instant (DST aware)', () => {
    expect(instantAt('2026-10-19', 975, TZ).toISOString()).toBe('2026-10-19T20:15:00.000Z'); // EDT
    expect(instantAt('2026-11-02', 975, TZ).toISOString()).toBe('2026-11-02T21:15:00.000Z'); // EST
  });
});

describe('planReminders', () => {
  const now = new Date('2026-10-19T17:15:00Z'); // Mon 1:15 pm Toronto
  it('one per alerted block occurrence in the next 48 h, after now', () => {
    const d = data([
      { id: 'gym', weekday: 0, start: 975, end: 1050, title: 'Gym' },
      { id: 'gym-tue', weekday: 1, start: 975, end: 1050, title: 'Gym' },
    ]);
    const r = planReminders(d, { gym: 10, 'gym-tue': 0 }, now, TZ, quiet);
    expect(r.map((x) => [x.at.toISOString(), x.title, x.body])).toEqual([
      ['2026-10-19T20:05:00.000Z', 'Gym in 10 min', 'Starts at 4:15 pm.'],
      ['2026-10-20T20:15:00.000Z', 'Gym starts now', 'Until 5:30 pm.'],
    ]);
    expect(r[0]!.blockKey).toBe('gym:2026-10-19');
  });
  it('blocks that already started or fall in quiet hours are left out', () => {
    const d = data([
      { id: 'early', weekday: 1, start: 480, end: 540, title: 'Run' },
      { id: 'past', weekday: 0, start: 600, end: 660, title: 'Class' },
    ]);
    expect(planReminders(d, { early: 10, past: 10 }, now, TZ, quiet)).toEqual([]);
  });
  it('at most 6 a day', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `b${i}`,
      weekday: 1,
      start: 600 + i * 60,
      end: 630 + i * 60,
      title: `B${i}`,
    }));
    const r = planReminders(
      data(many),
      Object.fromEntries(many.map((b) => [b.id, 0])),
      now,
      TZ,
      quiet,
    );
    expect(r).toHaveLength(6);
  });
});
