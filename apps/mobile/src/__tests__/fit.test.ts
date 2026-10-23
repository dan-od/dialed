import { resolveDay } from '@dialed/schedule';
import { fitModel, nextFree } from '../blocks/fit';

// v11 fit strip (Add/Edit/Move sheets): worked examples from the prototype's seed, which matches ours.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');
const mon = resolveDay('2026-10-19', seedData()).blocks.map((b) => ({ ...b, color: '#000000' }));
const round = (n: number) => Math.round(n * 100) / 100;

describe('fit strip', () => {
  it('add-overlap: 8:30–10 pm runs into WellServices by 90 min; next free 10 pm; window 7 pm–12 am', () => {
    const m = fitModel({
      day: mon,
      start: 1230,
      end: 1320,
      title: 'Prayers, login flow',
      keep: false,
    });
    expect(m.head).toEqual({ kind: 'clash', title: 'WellServices', minutes: 90 });
    expect([m.lo, m.hi]).toEqual([1140, 1440]);
    expect(m.ticks.map((t) => t.label)).toEqual([
      '7 pm',
      '8 pm',
      '9 pm',
      '10 pm',
      '11 pm',
      '12 am',
    ]);
    const wf = m.segs.find((s) => s.title === 'WellServices')!;
    expect([round(wf.left), round(wf.width)]).toEqual([30, 30]);
    const ss = m.segs.find((s) => s.title === 'Sermon Sync')!;
    expect([round(ss.left), round(ss.width)]).toEqual([0, 25]);
    expect([round(m.hatch!.left), round(m.hatch!.width)]).toEqual([30, 30]);
    expect(m.me).toMatchObject({ label: 'Prayers, login flow', bad: true });
    expect(m.slot).toMatchObject({ start: 1320, label: '10:00 pm' });
    expect(round(m.slot!.left)).toBe(60);
    expect(m.caption).toBe('Dashed: the next free 1h 30m. Tap it to move there.');
    expect(m.a11y).toBe('Overlaps WellServices, 8:30 pm to 10:00 pm');
  });
  it('Keep both: no hatch, no ring, no slot; "Sharing time with …"', () => {
    const m = fitModel({ day: mon, start: 1230, end: 1320, title: 'x', keep: true });
    expect(m.head).toEqual({ kind: 'sharing', title: 'WellServices' });
    expect(m.hatch).toBeNull();
    expect(m.slot).toBeNull();
    expect(m.me.bad).toBe(false);
  });
  it('add (blank, 10–11 pm): fits; "Free 10:00 pm to 12:00 am"; window 9 pm–12 am; "New block"', () => {
    const m = fitModel({ day: mon, start: 1320, end: 1380, title: '', keep: false });
    expect(m.head).toEqual({ kind: 'free', text: 'Free 10:00 pm to 12:00 am' });
    expect([m.lo, m.hi]).toEqual([1260, 1440]);
    expect(m.ticks.map((t) => t.label)).toEqual(['9 pm', '10 pm', '11 pm', '12 am']);
    expect(m.me.label).toBe('New block');
    expect(m.a11y).toBe('Fits, 10:00 pm to 11:00 pm');
  });
  it('ticks sit at their true positions; every 2 h when the window is over 6 h', () => {
    const m = fitModel({ day: mon, start: 600, end: 960, title: 'Long', keep: false });
    expect(m.hi - m.lo).toBeGreaterThan(360);
    expect(m.ticks.every((t, i, a) => i === 0 || t.m - a[i - 1]!.m === 120)).toBe(true);
    expect(round(m.ticks[0]!.left)).toBe(0);
  });
  it('the block being edited is left out (it would overlap itself)', () => {
    const gym = mon.find((b) => b.title === 'Gym')!;
    const m = fitModel({
      day: mon,
      start: gym.start_min,
      end: gym.end_min,
      title: 'Gym',
      keep: false,
      ignoreKey: gym.key,
    });
    expect(m.head.kind).toBe('free');
    expect(m.segs.some((s) => s.key === gym.key)).toBe(false);
  });
  it('next free slot of the same length only looks later and never past midnight', () => {
    expect(nextFree(mon, 1230, 1320)).toBe(1320);
    expect(nextFree(mon, 1380, 1500)).toBeNull();
  });
  it('no strip for end ≤ start', () => {
    expect(fitModel({ day: mon, start: 1260, end: 1230, title: '', keep: false }).show).toBe(false);
  });
});
