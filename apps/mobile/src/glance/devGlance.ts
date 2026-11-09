import type { DevicePrefs, SnapshotV1 } from '@dialed/contracts';
import { addDays, instantAt, type IsoDate, type ScheduleData } from '@dialed/schedule';
import { buildSnapshot } from './snapshot';

// Dev-only proof tool (Flow 08 step 10; `__DEV__` builds only, like the dev clock). Widgets run on the
// device's real clock, so to show the prototype's clock points (1:15 pm work block, 5:30 pm meal, 8:20 pm gap)
// the app writes the seed Monday into the snapshot under an `Etc/GMT±N` zone whose hour matches the target,
// with every block nudged by the leftover minutes (< 1 h). Real code paths read it as any other snapshot.

let pinned = false;
/** While pinned, the app's own snapshot writes and Live Activity syncs stand down. */
export const devGlancePinned = () => __DEV__ && pinned;
export function setDevGlancePinned(v: boolean) {
  pinned = __DEV__ && v;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The Etc zone whose local hour at `real` is `hour`, plus that zone's local date and minute. */
export function zoneForHour(real: Date, hour: number) {
  const utcMin = real.getUTCHours() * 60 + real.getUTCMinutes();
  let off = hour - real.getUTCHours();
  if (off > 14) off -= 24;
  if (off < -12) off += 24;
  // Etc/GMT signs are inverted: Etc/GMT-5 is UTC+5.
  const zone = off === 0 ? 'Etc/UTC' : `Etc/GMT${off > 0 ? '-' : '+'}${Math.abs(off)}`;
  const localMs = real.getTime() + off * 3_600_000;
  const d = new Date(localMs);
  const date =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` as IsoDate;
  return { zone, date, minute: (utcMin + off * 60 + 1440) % 1440 };
}

/**
 * The seed `source` day (a Monday) as a snapshot in which the device's real time `real` falls at `targetMinute`.
 * Shown times are off by `shift` minutes (< 60), reported so the proof can say so.
 */
export function devGlanceSnapshot(
  data: ScheduleData,
  prefs: Pick<DevicePrefs, 'lock_mode' | 'line_on'>,
  source: IsoDate,
  targetMinute: number,
  real: Date,
): { snapshot: SnapshotV1; zone: string; shift: number; localDate: IsoDate } {
  const z = zoneForHour(real, Math.floor(targetMinute / 60));
  const shift = z.minute - targetMinute;
  const base = buildSnapshot(data, prefs, 'Etc/UTC', instantAt(source, targetMinute, 'Etc/UTC'));
  const move = (blocks: SnapshotV1['days'][0]['blocks']) =>
    blocks
      .map((b) => ({ ...b, start_min: b.start_min + shift, end_min: b.end_min + shift }))
      .filter((b) => b.start_min >= 0 && b.end_min <= 1440);
  const snapshot: SnapshotV1 = {
    ...base,
    generated_at: real.toISOString(),
    time_zone: z.zone,
    days: [
      { date: z.date, blocks: move(base.days[0].blocks) },
      { date: addDays(z.date, 1), blocks: move(base.days[1].blocks) },
    ],
    week: { ...base.week, start: z.date },
  };
  return { snapshot, zone: z.zone, shift, localDate: z.date };
}
