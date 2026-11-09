import { DEFAULT_DEVICE_PREFS } from '@dialed/contracts';
import { devGlanceSnapshot, zoneForHour } from '../glance/devGlance';
import { glancePreview } from '../glance/preview';

// Flow 08 step 10 dev proof tool: the real clock lands on the target minute of the seed Monday.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

describe('devGlanceSnapshot', () => {
  it('picks the Etc zone whose hour matches (signs inverted)', () => {
    const real = new Date('2026-11-09T00:07:00Z');
    expect(zoneForHour(real, 13)).toEqual({ zone: 'Etc/GMT-13', date: '2026-11-09', minute: 787 });
    expect(zoneForHour(real, 20)).toEqual({ zone: 'Etc/GMT+4', date: '2026-11-08', minute: 1207 });
    expect(zoneForHour(new Date('2026-11-09T13:40:00Z'), 13).zone).toBe('Etc/UTC');
  });

  for (const [target, check] of [
    [
      795,
      (p: NonNullable<ReturnType<typeof glancePreview>>) =>
        p.now?.title === 'Sermon Sync' && p.dayRing.left === 5,
    ],
    [
      1050,
      (p: NonNullable<ReturnType<typeof glancePreview>>) =>
        p.now === null && p.line.startsWith('Dinner · '),
    ],
    [
      1220,
      (p: NonNullable<ReturnType<typeof glancePreview>>) =>
        p.line.startsWith('Next: WellServices at '),
    ],
  ] as const)
    it(`at the device's real time the widgets read minute ${target} of the seed Monday`, () => {
      for (const iso of ['2026-11-08T23:58:00Z', '2026-11-09T05:31:00Z', '2026-11-09T17:02:00Z']) {
        const real = new Date(iso);
        const r = devGlanceSnapshot(seedData(), DEFAULT_DEVICE_PREFS, '2037-10-19', target, real);
        expect(Math.abs(r.shift)).toBeLessThan(60);
        const p = glancePreview(r.snapshot, real)!;
        expect(p).not.toBeNull();
        expect(check(p)).toBe(true);
      }
    });
});
