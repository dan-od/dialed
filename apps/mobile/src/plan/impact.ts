import type { PlanChangeRow, PlanDTO } from '@dialed/contracts';
import {
  addDays,
  applyOps,
  formatClock,
  formatRange,
  parseClock,
  planImpact,
  planOps,
  resolveDay,
  weekdayOf,
  type PlanChange,
  type PlanImpactRow,
  type ScheduleData,
} from '@dialed/schedule';

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

type Payload = Record<string, unknown>;
const str = (p: Payload, k: string) => (typeof p[k] === 'string' ? (p[k] as string) : undefined);

/** A stored change row in the shape planOps takes (same as the approve route builds it). */
function toPlanChange(row: PlanChangeRow): PlanChange {
  return { kind: row.kind, title: row.title, ...row.payload, note: row.note } as PlanChange;
}

/** First date on or after `today` that falls on `weekday` (0 = Monday). */
function nextWeekday(today: string, weekday: number): string {
  return addDays(today, (weekday - weekdayOf(today) + 7) % 7);
}

/** The date a change first touches: its own date, the next matching weekday, or today. */
function changeDate(row: PlanChangeRow, data: ScheduleData, today: string): string {
  const p = row.payload;
  const date = str(p, 'on_date') ?? str(p, 'from') ?? str(p, 'close_from');
  if (date) return date < today ? today : date;
  const repeat = p.repeat as { weekday?: string; from?: string } | undefined;
  if (repeat?.from && repeat.from >= today) return repeat.from;
  const named = str(p, 'to_weekday') ?? repeat?.weekday;
  if (named && WEEKDAY_NAMES.includes(named))
    return nextWeekday(today, WEEKDAY_NAMES.indexOf(named));
  const block = data.routineBlocks.find((b) => b.id === str(p, 'block_ref'));
  return block ? nextWeekday(today, block.weekday) : today;
}

/**
 * "What this does to your week": work hours before → after for the week the plan first touches (changed
 * weekdays, Weekend, Week), from the phone's copy of the schedule. Empty if the draft can't be applied here.
 */
export function weekImpact(plan: PlanDTO, data: ScheduleData, today: string): PlanImpactRow[] {
  const rows = (plan.changes ?? []).filter((c) => c.enabled).sort((a, b) => a.ord - b.ord);
  if (!rows.length) return [];
  try {
    const after = applyOps(data, planOps(rows.map(toPlanChange), data, today));
    const first = rows.map((r) => changeDate(r, data, today)).sort()[0]!;
    return planImpact(data, after, first);
  } catch {
    return [];
  }
}

/** "Wed 7:15 pm" */
const at = (date: string, min: number) => `${DAY[weekdayOf(date)]} ${formatClock(min)}`;
/** "Sun 3:00–4:45 pm" */
const span = (date: string, start: number, end: number) =>
  `${DAY[weekdayOf(date)]} ${formatRange(start, end)} ${formatClock(end).slice(-2)}`;

/**
 * A change card's times: the old time (struck through) and the new one. Old times come from the block as it
 * is on the day the change touches.
 */
export function changeTimes(
  row: PlanChangeRow,
  data: ScheduleData,
  today: string,
): { from: string | null; to: string } {
  const p = row.payload;
  const date = changeDate(row, data, today);
  const blockId = str(p, 'block_ref');
  const block = data.routineBlocks.find((b) => b.id === blockId);
  // The occurrence being changed: its own date, else the block's next weekday from when the change starts.
  const repeat = p.repeat as { weekday?: string; from?: string } | undefined;
  const starts = [str(p, 'from'), str(p, 'close_from'), today].filter(Boolean).sort().at(-1)!;
  const oldDate = str(p, 'on_date') ?? (block ? nextWeekday(starts, block.weekday) : date);
  const old = blockId
    ? resolveDay(oldDate, data).blocks.find((b) => b.routine_block_id === blockId)
    : undefined;
  const from = old ? at(oldDate, old.start_min) : null;
  const clock = (k: string, fields: Payload = p) => {
    const v = str(fields, k);
    try {
      return v ? parseClock(v) : undefined;
    } catch {
      return undefined;
    }
  };

  switch (row.kind) {
    case 'new': {
      const s = clock('start');
      const e = clock('end');
      const prefix = repeat?.weekday && !str(p, 'on_date') ? 'Every ' : '';
      return { from: null, to: s != null && e != null ? prefix + span(date, s, e) : row.title };
    }
    case 'moved': {
      const toWeekday = str(p, 'to_weekday');
      const target =
        str(p, 'to_date') ??
        (toWeekday && WEEKDAY_NAMES.includes(toWeekday)
          ? nextWeekday(
              repeat?.from && repeat.from > starts ? repeat.from : starts,
              WEEKDAY_NAMES.indexOf(toWeekday),
            )
          : oldDate);
      const s = clock('start') ?? old?.start_min;
      const e = clock('end') ?? (old && s != null ? s + (old.end_min - old.start_min) : undefined);
      return { from, to: s != null && e != null ? span(target, s, e) : DAY[weekdayOf(target)]! };
    }
    case 'changed': {
      const fields = (p.fields as Payload | undefined) ?? {};
      const s = clock('start', fields) ?? old?.start_min;
      const e = clock('end', fields) ?? old?.end_min;
      if (clock('start', fields) != null || clock('end', fields) != null)
        return { from, to: s != null && e != null ? span(date, s, e) : row.title };
      return { from, to: str(fields, 'title') ?? row.title };
    }
    case 'skip':
      return { from, to: 'Skipped' };
    case 'removed':
      return {
        from,
        to: `Removed from ${DAY[weekdayOf(date)]} ${date.slice(5).replace('-', '/')}`,
      };
    default:
      return { from: null, to: '' }; // categories, terms: the title says it
  }
}

/** Weekday the approved plan starts to apply: "this Wednesday", or "Thu, Nov 19" when it's later. */
export function startsLabel(plan: PlanDTO, data: ScheduleData, today: string): string {
  const rows = (plan.changes ?? []).filter((c) => c.enabled);
  if (!rows.length) return 'today';
  const first = rows.map((r) => changeDate(r, data, today)).sort()[0]!;
  if (first === today) return 'today';
  const days = Math.round(
    (Date.parse(first + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86_400_000,
  );
  if (days < 7 && weekdayOf(first) > weekdayOf(today)) {
    const full = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    return `this ${full[weekdayOf(first)]}`;
  }
  const d = new Date(first + 'T12:00:00Z');
  return d.toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
