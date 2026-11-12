import type { PlanDTO } from '@dialed/contracts';
import { formatClock } from '@dialed/schedule';
import { changeTimes, startsLabel, weekImpact } from '../plan/impact';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const data = seedData();
const TODAY = '2037-10-19'; // Monday
const well = data.routineBlocks.find(
  (b: { title: string; weekday: number }) => b.title === 'WellServices' && b.weekday === 2,
);

const plan = (changes: PlanDTO['changes']): PlanDTO =>
  ({ changes, status: 'ready' }) as unknown as PlanDTO;
const row = (kind: string, payload: Record<string, unknown>, enabled = true) => ({
  id: `${kind}-1`,
  ord: 0,
  kind,
  title: 'WellServices',
  payload,
  note: 'n',
  enabled,
  validation: {},
});

describe('weekImpact (review: real affected days, not the prototype’s Wednesday)', () => {
  it('skipping Wednesday’s WellServices shows Wednesday, Weekend and Week, before → after', () => {
    const rows = weekImpact(
      plan([row('skip', { block_ref: well.id, on_date: '2037-10-21' }) as never]),
      data,
      TODAY,
    );
    expect(rows.map((r) => r.label)).toEqual(['Wednesday', 'Weekend', 'Week']);
    const wed = rows[0]!;
    expect(parseFloat(wed.after)).toBeLessThan(parseFloat(wed.before));
    expect(rows[1]!.before).toBe(rows[1]!.after);
  });

  it('turned-off changes don’t count; nothing on → no rows', () => {
    expect(
      weekImpact(
        plan([row('skip', { block_ref: well.id, on_date: '2037-10-21' }, false) as never]),
        data,
        TODAY,
      ),
    ).toEqual([]);
  });
});

describe('changeTimes', () => {
  it('a skip strikes the old time and says Skipped', () => {
    const t = changeTimes(
      row('skip', { block_ref: well.id, on_date: '2037-10-21' }) as never,
      data,
      TODAY,
    );
    expect(t).toEqual({ from: `Wed ${formatClock(well.start_min)}`, to: 'Skipped' });
  });

  it('a move shows old time → new day and range', () => {
    const t = changeTimes(
      row('moved', {
        block_ref: well.id,
        on_date: '2037-10-21',
        to_date: '2037-10-25',
        start: '15:00',
        end: '16:45',
      }) as never,
      data,
      TODAY,
    );
    expect(t).toEqual({ from: `Wed ${formatClock(well.start_min)}`, to: 'Sun 3:00–4:45 pm' });
  });

  it('a weekly move (to_weekday, close_from) strikes the old weekday and names the new one', () => {
    const t = changeTimes(
      row('moved', {
        block_ref: well.id,
        repeat: { weekday: 'sun', from: '2037-10-25', until: '2037-12-11' },
        to_weekday: 'sun',
        start: '15:00',
        end: '16:45',
        close_from: '2037-10-21',
      }) as never,
      data,
      TODAY,
    );
    expect(t).toEqual({ from: `Wed ${formatClock(well.start_min)}`, to: 'Sun 3:00–4:45 pm' });
  });

  it('a new weekly block has no old time', () => {
    const t = changeTimes(
      row('new', { repeat: { weekday: 'wed' }, start: '19:00', end: '20:30' }) as never,
      data,
      TODAY,
    );
    expect(t).toEqual({ from: null, to: 'Every Wed 7:00–8:30 pm' });
  });
});

describe('startsLabel', () => {
  it('names the weekday this week, else the date', () => {
    const skip = (d: string) => plan([row('skip', { block_ref: well.id, on_date: d }) as never]);
    expect(startsLabel(skip('2037-10-21'), data, TODAY)).toBe('this Wednesday');
    expect(startsLabel(skip('2037-10-28'), data, TODAY)).toBe('Wed, Oct 28');
  });
});
