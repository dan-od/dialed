import type { IsoDate } from './types';

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(date: IsoDate): [number, number, number] {
  const m = ISO.exec(date);
  if (!m) throw new Error(`Not an ISO date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function toUtc(date: IsoDate): Date {
  const [y, mo, d] = parts(date);
  return new Date(Date.UTC(y, mo - 1, d));
}

function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  return fromUtc(toUtc(value)) === value;
}

/** Monday = 0 … Sunday = 6. Pure calendar math; time zones and DST never apply. */
export function weekdayOf(date: IsoDate): number {
  return (toUtc(date).getUTCDay() + 6) % 7;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Monday of the week containing `date` (weeks start Monday, D-30). */
export function weekStartOf(date: IsoDate): IsoDate {
  return addDays(date, -weekdayOf(date));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** ISO-8601 week number. */
export function isoWeekNumber(date: IsoDate): number {
  const thursday = addDays(date, 3 - weekdayOf(date));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  return Math.floor(daysBetween(jan1, thursday) / 7) + 1;
}

/** The calendar date and wall-clock minute of `instant` in `timeZone`. */
export function localNow(instant: Date, timeZone: string): { date: IsoDate; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(instant).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minute: Number(p.hour) * 60 + Number(p.minute) };
}
