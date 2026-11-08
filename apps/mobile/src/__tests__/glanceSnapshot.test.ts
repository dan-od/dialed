import { DEFAULT_DEVICE_PREFS } from '@dialed/contracts';
import { buildSnapshot, SnapshotV1 } from '../glance/snapshot';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const data = seedData();
const TZ = 'America/Toronto';
// Monday 2037-10-19, 1:15 pm in Toronto (EDT, UTC-4).
const now = new Date('2037-10-19T17:15:00.000Z');

describe('buildSnapshot (C-x08 widget snapshot v1)', () => {
  const s = buildSnapshot(data, DEFAULT_DEVICE_PREFS, TZ, now);

  it('matches the v1 schema', () => {
    expect(() => SnapshotV1.parse(s)).not.toThrow();
    expect(s).toMatchObject({
      version: 1,
      generated_at: '2037-10-19T17:15:00.000Z',
      time_zone: TZ,
      setup_needed: false,
      settings: { lock_mode: 'live', line_on: true, rundown_default: 'today', widget_meals: true },
    });
  });

  it('carries today and tomorrow resolved in the profile time zone', () => {
    expect(s.days.map((d) => d.date)).toEqual(['2037-10-19', '2037-10-20']);
    expect(s.days[0]!.blocks).toHaveLength(11);
    expect(s.days[0]!.blocks[4]).toMatchObject({
      title: 'Sermon Sync',
      start_min: 760,
      end_min: 870,
      quiet: false,
    });
    expect(s.days[0]!.blocks[0]).toMatchObject({ title: 'Breakfast', quiet: true });
    expect(s.days[1]!.blocks[1]).toMatchObject({ title: 'Cryptography lecture', start_min: 490 });
  });

  it('week: Monday-first work hours per day, planned total and top 3 categories', () => {
    expect(s.week.start).toBe('2037-10-19');
    expect(s.week.hours_by_day).toHaveLength(7);
    // Monday work: 80 + 60 + 110 + 90 + 75 + 120 + 90 = 625 min → 10.4h (half-up to 0.1).
    expect(s.week.hours_by_day[0]).toBe(10.4);
    // Rounded once from total minutes, so it can differ from the sum of rounded days by < 0.1 h per day.
    const sum = s.week.hours_by_day.reduce((a, b) => a + b, 0);
    expect(Math.abs(s.week.planned_hours - sum)).toBeLessThan(0.7);
    expect(s.week.top_categories).toHaveLength(3);
    expect(s.week.top_categories[0]!.hours).toBeGreaterThanOrEqual(s.week.top_categories[1]!.hours);
  });

  it('categories by id with both colours and the quiet flag; no tokens or account data', () => {
    const meal = Object.values(s.categories).find((c) => c.name === 'Meal');
    expect(meal).toMatchObject({ quiet: true });
    expect(meal!.color_dark).toMatch(/^#/);
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/token|email|password/i);
  });

  it('is stable for the same input (the writer skips identical rewrites)', () => {
    const again = buildSnapshot(data, DEFAULT_DEVICE_PREFS, TZ, now);
    expect(JSON.stringify(again)).toBe(JSON.stringify(s));
  });

  it('Line only forces the line on', () => {
    const lo = buildSnapshot(
      data,
      { ...DEFAULT_DEVICE_PREFS, lock_mode: 'line', line_on: false },
      TZ,
      now,
    );
    expect(lo.settings).toMatchObject({ lock_mode: 'line', line_on: true });
  });

  it('no routine blocks: setup_needed (widgets say "Set up your week in Dialed")', () => {
    const empty = buildSnapshot(
      { ...data, routineBlocks: [], overrides: [] },
      DEFAULT_DEVICE_PREFS,
      TZ,
      now,
    );
    expect(empty.setup_needed).toBe(true);
    expect(empty.days[0]!.blocks).toEqual([]);
  });

  it('just after midnight local time, today is the new day', () => {
    const late = buildSnapshot(
      data,
      DEFAULT_DEVICE_PREFS,
      TZ,
      new Date('2037-10-20T04:05:00.000Z'),
    );
    expect(late.days[0]!.date).toBe('2037-10-20');
  });
});
