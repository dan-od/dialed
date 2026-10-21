import { weekStartOf } from '@dialed/schedule';
import { cardsModel, monthModel, weekModel } from '../week/model';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');
const data = seedData();
const colors = { isLight: false };
// The prototype's sample clock: Monday Oct 19, 2026, 1:15 pm.
const NOW = { date: '2026-10-19', minute: 795 };

describe('Week lanes (prototype numbers from the seeded owner)', () => {
  const w = weekModel(data, weekStartOf(NOW.date), NOW, colors);
  it('header, title and planned hours', () => {
    expect(w.label).toBe('Week 43');
    expect(w.title).toBe('Oct 19–25');
    expect(w.planned).toBe('64h planned');
  });
  it('lane totals and summaries (Life categories left out of the summary; today prefixed)', () => {
    expect(w.lanes.map((l) => l.total)).toEqual([
      '10.4h',
      '12.1h',
      '11.6h',
      '10.9h',
      '10.8h',
      '5.3h',
      '3.3h',
    ]);
    expect(w.lanes.map((l) => l.summary)).toEqual([
      'Today, Sermon Sync 3.8h, Study 2.5h',
      'Study 3h, Class 2.8h',
      'Class 4.2h, Study 2.9h',
      'Class 4.2h, Sermon Sync 1.5h',
      'Study 3.8h, Sermon Sync 1.5h',
      'Sermon Sync 2.5h, WellServices 1.5h',
      'Sermon Sync 1.8h, Study 1.5h',
    ]);
    expect(w.lanes[0]!.a11y).toBe('Monday 19, today, 10.4 hours. Open in detail.');
    expect(w.lanes[1]!.a11y).toBe('Tuesday 20, 12.1 hours. Open in detail.');
  });
  it('tracks use the fixed 8 am–midnight axis; past blocks today are dimmed; now marker at 32.8%', () => {
    const mon = w.lanes[0]!;
    expect(mon.segs[0]).toMatchObject({ left: 6.25, past: true });
    expect(mon.segs[0]!.width).toBeCloseTo(3.77, 2);
    expect(mon.segs.find((s) => s.left === 29.17)?.past).toBe(false);
    expect(mon.now).toBeCloseTo(32.8, 1);
    expect(w.lanes[1]!.segs[0]).toMatchObject({ left: 0 }); // Tue breakfast 7:30 clipped to 8:00
    expect(w.lanes[1]!.now).toBeNull();
  });
  it("legend order: by the week's hours, Life last (prototype hand-orders it; recorded delta)", () => {
    expect(w.legend.map((l) => l.name)).toEqual([
      'Study',
      'Sermon Sync',
      'Class',
      'WellServices',
      'Prayers',
      'Speedwatch Ontario',
      'Gym',
    ]);
  });
});

describe('Day cards', () => {
  const c = cardsModel(data, weekStartOf(NOW.date), NOW, colors);
  it('cards: today first label, work blocks only, current block shows time left, past dimmed', () => {
    const mon = c.cards[0]!;
    expect(mon).toMatchObject({ label: 'Today', numeral: '19', total: '10.4h', today: true });
    expect(mon.rows.map((r) => [r.time, r.title, r.duration, r.past, r.current])).toEqual([
      ['9:40', 'Advanced Networking I', '1h 20m', true, false],
      ['11:00', 'Review networking notes', '1h', true, false],
      ['12:40', 'Sermon Sync', '1h 15m left', false, true],
      ['2:45', 'Cryptography prep', '1h 30m', false, false],
      ['4:15', 'Gym', '1h 15m', false, false],
      ['6:15', 'Sermon Sync', '2h', false, false],
      ['8:30', 'WellServices', '1h 30m', false, false],
    ]);
    expect(c.cards[2]).toMatchObject({ label: 'Wednesday', numeral: '21', total: '11.6h' });
  });
  it('tiles: Projects per category, School combined, Life as days', () => {
    // Same values as the prototype; ordered by hours (School 27.2h first), Life last.
    expect(c.tiles.map((t) => [t.value, t.label])).toEqual([
      ['27.2h', 'School'],
      ['14.6h', 'Sermon Sync'],
      ['6.3h', 'WellServices'],
      ['4.5h', 'Prayers'],
      ['4.3h', 'Speedwatch Ontario'],
      ['6x', 'Gym'],
    ]);
  });
});

describe('Month poster and weeks', () => {
  const m = monthModel(data, '2026-10', NOW, colors);
  it('poster: computed planned / done / days to go', () => {
    expect(m).toMatchObject({
      month: 'Oct',
      year: '2026',
      planned: '276h planned',
      done: '153h done',
      toGo: '12 days to go',
    });
  });
  it('31 day columns, past dimmed, today ringed, Thanksgiving labelled from its note', () => {
    expect(m.days).toHaveLength(31);
    expect(m.days[17]!.past).toBe(true);
    expect(m.days[18]).toMatchObject({ today: true, past: false });
    expect(m.days[11]!.segs.map((s) => [s.name, s.hours])).toEqual([['Sermon Sync', 2]]);
    expect(m.axisNotes).toEqual([expect.objectContaining({ day: 12, label: 'Thanksgiving' })]);
  });
  it('axis numbers never overlap: today and noted days win over Mondays and the last day', () => {
    const at = (date: string, minute = 600) =>
      monthModel(data, '2026-10', { date, minute }, colors).axis.map((a) => a.label);
    expect(at('2026-10-19')).toEqual(['1', '5', '12', '19', '26', '31']);
    expect(at('2026-10-21')).toEqual(['1', '5', '12', '19', '21', '26', '31']);
    expect(at('2026-10-30')).toEqual(['1', '5', '12', '19', '26', '30']); // 31 would overlap today's 30
  });
  it('week rows: ranges, hours, current and past', () => {
    expect(m.weeks.map((w) => [w.label, w.total, w.current, w.past])).toEqual([
      ['Sep 28–Oct 4', '64.3h', false, true],
      ['Oct 5–11', '64.3h', false, true],
      ['Oct 12–18', '55.8h', false, true],
      ['Oct 19–25', '64.3h', true, false],
      ['Oct 26–Nov 1', '64.3h', false, false],
    ]);
  });
});
