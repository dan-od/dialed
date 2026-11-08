import { resolveDay } from '@dialed/schedule';
import { lineState, lineText } from '../glance/lineText';

// Golden input: the owner's seed (Monday 2037-10-19, Tuesday 2037-10-20).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const data = seedData();
const mon = resolveDay('2037-10-19', data).blocks;
const tue = resolveDay('2037-10-20', data).blocks;
const line = (minute: number, mode: 'live' | 'line', lineOn = true) =>
  lineText(lineState(mon, tue, minute), { lock_mode: mode, line_on: lineOn });

describe('lineText: the line under the date (Flow 08, prototype scrLock)', () => {
  it('quiet block at 17:30: "Dinner · 45m left, then Sermon Sync" (flow build seed)', () => {
    expect(line(1050, 'live')).toBe('Dinner · 45m left, then Sermon Sync');
    expect(line(1050, 'line')).toBe('Dinner · 45m left, then Sermon Sync');
  });

  it('work block with a Live Activity: "Then <next work block> at 2:45" (no duplication)', () => {
    expect(line(795, 'live')).toBe('Then Cryptography prep at 2:45');
  });

  it('work block, Line only: "<title> · 1h 15m left"', () => {
    expect(line(795, 'line')).toBe('Sermon Sync · 1h 15m left');
  });

  it('gap: "Next: WellServices at 8:30"', () => {
    expect(line(1220, 'live')).toBe('Next: WellServices at 8:30');
  });

  it('day done before 10 pm: "Day done"', () => {
    const done = lineState(mon.slice(0, 3), tue, 1260);
    expect(lineText(done, { lock_mode: 'live', line_on: true })).toBe('Day done');
  });

  it("day done after 10 pm: tomorrow's first work block", () => {
    expect(line(1330, 'live')).toBe('Tomorrow: Cryptography lecture at 8:10');
  });

  it('last work block with a Live Activity and nothing after: "Last block today"', () => {
    expect(line(1300, 'live')).toBe('Last block today');
  });

  it('line switched off (Live Activity mode): no line; Line only forces it on', () => {
    expect(line(1050, 'live', false)).toBe('');
    expect(line(795, 'line', false)).toBe('Sermon Sync · 1h 15m left');
  });

  it('no blocks today or tomorrow: "Day done"', () => {
    expect(lineText(lineState([], [], 600), { lock_mode: 'live', line_on: true })).toBe('Day done');
  });
});

describe('lineAt: the line from the widget snapshot at an instant (what the inline widget shows)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { buildSnapshot } = require('../glance/snapshot');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { lineAt } = require('../glance/lineText');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DEFAULT_DEVICE_PREFS } = require('@dialed/contracts');
  const TZ = 'America/Toronto';
  const made = new Date('2037-10-19T04:00:00.000Z'); // Mon 12:00 am EDT
  const snap = buildSnapshot(data, DEFAULT_DEVICE_PREFS, TZ, made);
  const lineOnly = buildSnapshot(data, { ...DEFAULT_DEVICE_PREFS, lock_mode: 'line' }, TZ, made);
  const at = (s: unknown, iso: string) => lineAt(s, new Date(iso));

  it('reads the snapshot settings and the local minute in its time zone', () => {
    expect(at(snap, '2037-10-19T17:15:00Z')).toBe('Then Cryptography prep at 2:45');
    expect(at(lineOnly, '2037-10-19T17:15:00Z')).toBe('Sermon Sync · 1h 15m left');
    expect(at(snap, '2037-10-19T21:30:00Z')).toBe('Dinner · 45m left, then Sermon Sync');
    expect(at(snap, '2037-10-20T00:20:00Z')).toBe('Next: WellServices at 8:30');
    expect(at(snap, '2037-10-20T01:40:00Z')).toBe('Last block today');
    expect(at(snap, '2037-10-20T02:10:00Z')).toBe('Tomorrow: Cryptography lecture at 8:10');
  });

  it('after midnight it uses tomorrow from the same snapshot', () => {
    expect(at(snap, '2037-10-20T04:30:00Z')).toBe('Next: Cryptography lecture at 8:10');
  });

  it('past both days, or older than 26 h: "Open Dialed to refresh"', () => {
    expect(at(snap, '2037-10-21T04:30:00Z')).toBe('Open Dialed to refresh');
  });

  it('no routine: "Set up your week in Dialed"; line off in Live Activity mode: empty', () => {
    const empty = buildSnapshot(
      { ...data, routineBlocks: [], overrides: [] },
      DEFAULT_DEVICE_PREFS,
      TZ,
      made,
    );
    expect(at(empty, '2037-10-19T17:15:00Z')).toBe('Set up your week in Dialed');
    const off = buildSnapshot(data, { ...DEFAULT_DEVICE_PREFS, line_on: false }, TZ, made);
    expect(at(off, '2037-10-19T17:15:00Z')).toBe('');
  });
});
