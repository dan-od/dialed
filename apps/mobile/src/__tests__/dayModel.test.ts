import { resolveDay } from '@dialed/schedule';
import { dayModel, heroTitleSize } from '../day/model';

// Golden input: the owner's seed, loaded through the same parser the schedule package tests use.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const data = seedData();
const mon = resolveDay('2026-10-19', data).blocks;
const tue = resolveDay('2026-10-20', data).blocks;
const colors = { acc: 'ACC', barPast: 'PAST', barFut: 'FUT' };
// Prototype day bounds (9 am–12 am) so the numbers match the approved prototype exactly.
const model = (minute: number) =>
  dayModel({
    blocks: mon,
    tomorrow: tue,
    minute,
    dayStart: 540,
    dayEnd: 1440,
    width: 370,
    isLight: false,
    colors,
  });

describe('Day hero at the Flow 03 clock points (prototype numbers)', () => {
  it('795 (1:15 pm): Right now · Sermon Sync · 1:15 · left, ends 2:30 pm · 28% · 6 blocks', () => {
    const m = model(795);
    expect(m).toMatchObject({
      label: 'Right now',
      title: 'Sermon Sync',
      countdown: '1:15',
      sub: 'left, ends 2:30 pm',
      restLabel: '6 blocks',
    });
    expect(m.axis).toEqual({ start: '9 am', mid: '28% of the day gone', end: '12 am' });
    expect(m.bars.map((b) => b.tone)).toEqual([
      'past',
      'past',
      'past',
      'past',
      'current',
      'future',
      'future',
      'future',
      'future',
      'future',
      'future',
    ]);
    expect(m.rows.map((r) => [r.time, r.title, r.duration, r.quiet])).toEqual([
      ['2:30', 'Break', '15m', true],
      ['2:45', 'Cryptography prep', '1h 30m', false],
      ['4:15', 'Gym', '1h 15m', false],
      ['5:30', 'Dinner', '45m', true],
      ['6:15', 'Sermon Sync', '2h', false],
      ['8:30', 'WellServices', '1h 30m', false],
    ]);
    expect(m.heroA11y).toBe('Right now: Sermon Sync, 1 hour 15 minutes left, ends 2:30 pm');
    expect(m.bars[4]!.heightPct).toBe(100);
  });

  it('1220 (8:20 pm): Up next · WellServices · 0:10 · until it starts at 8:30 pm · 76% · 1 block', () => {
    const m = model(1220);
    expect(m).toMatchObject({
      label: 'Up next',
      title: 'WellServices',
      countdown: '0:10',
      sub: 'until it starts at 8:30 pm',
      restLabel: '1 block',
    });
    expect(m.axis.mid).toBe('76% of the day gone');
    expect(m.bars.every((b) => b.tone !== 'current')).toBe(true);
  });

  it("1410 (11:30 pm): All done · Day done · no countdown · 97% · 0 blocks · tomorrow from Tuesday's first work block", () => {
    const m = model(1410);
    expect(m).toMatchObject({
      label: 'All done',
      title: 'Day done',
      countdown: null,
      restLabel: '0 blocks',
      rows: [],
    });
    expect(m.axis.mid).toBe('97% of the day gone');
    const firstWork = tue.find((b) => !b.quiet)!;
    expect(m.sub).toBe(`Tomorrow starts at 8:10 am with your ${firstWork.title}.`);
    expect(firstWork.title).toBe('Cryptography lecture');
    expect(m.bars.every((b) => b.tone === 'past')).toBe(true);
  });

  it('title sizes follow the prototype formula', () => {
    expect(heroTitleSize('Sermon Sync', 330)).toBe(100);
    expect(heroTitleSize('WellServices', 330)).toBe(55);
    expect(heroTitleSize('Advanced Networking I', 330)).toBe(64);
  });

  it('empty day → Free day', () => {
    expect(
      dayModel({
        blocks: [],
        tomorrow: [],
        minute: 600,
        dayStart: 540,
        dayEnd: 1440,
        width: 370,
        isLight: false,
        colors,
      }).label,
    ).toBe('Free day');
  });
});
