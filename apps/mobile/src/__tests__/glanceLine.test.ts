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

  it("day done after 10 pm: tomorrow's first block", () => {
    expect(line(1330, 'live')).toBe('Tomorrow: Breakfast at 7:30');
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
