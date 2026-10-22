import {
  addDays,
  formatClock,
  localNow,
  resolveDay,
  type IsoDate,
  type ScheduleData,
} from '@dialed/schedule';

export interface PlannedReminder {
  /** `<block id>:<date>` (the Live Activity block_key shape). */
  blockKey: string;
  at: Date;
  title: string;
  body: string;
}

/** Flow 08: at most 6 local notes a day; explicit per-block alerts count toward it (D-32). */
export const DAILY_CAP = 6;

/** A local wall-clock time in `timeZone` as an instant (two passes settle DST edges). */
export function instantAt(date: IsoDate, minute: number, timeZone: string): Date {
  const target = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
  let t = target + minute * 60_000;
  for (let i = 0; i < 2; i++) {
    const l = localNow(new Date(t), timeZone);
    const seen = Date.UTC(
      Number(l.date.slice(0, 4)),
      Number(l.date.slice(5, 7)) - 1,
      Number(l.date.slice(8, 10)),
    );
    t += target + minute * 60_000 - (seen + l.minute * 60_000);
  }
  return new Date(t);
}

const inQuiet = (minute: number, q: { start: number; end: number }) =>
  q.start <= q.end ? minute >= q.start && minute < q.end : minute >= q.start || minute < q.end;

/** Reminders for blocks with an alert over the next 48 h: after now, outside quiet hours, capped per day. */
export function planReminders(
  data: ScheduleData,
  alerts: Record<string, number>,
  now: Date,
  timeZone: string,
  quiet: { start: number; end: number },
): PlannedReminder[] {
  const today = localNow(now, timeZone).date;
  const out: PlannedReminder[] = [];
  const end = now.getTime() + 48 * 3600_000;
  for (let i = 0; i <= 2; i++) {
    const date = addDays(today, i);
    let count = 0;
    for (const b of resolveDay(date, data).blocks) {
      const before = alerts[b.routine_block_id ?? ''] ?? alerts[b.override_id ?? ''];
      if (before === undefined || count >= DAILY_CAP) continue;
      const minute = b.start_min - before;
      const at = instantAt(date, minute, timeZone);
      if (at <= now || at.getTime() > end || inQuiet(((minute % 1440) + 1440) % 1440, quiet))
        continue;
      count++;
      out.push({
        blockKey: b.key,
        at,
        title: before === 0 ? `${b.title} starts now` : `${b.title} in ${before} min`,
        body:
          before === 0
            ? `Until ${formatClock(b.end_min)}.`
            : `Starts at ${formatClock(b.start_min)}.`,
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}
