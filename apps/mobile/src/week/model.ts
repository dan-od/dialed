import {
  addDays,
  formatClock,
  formatDuration,
  formatHours,
  isoWeekNumber,
  resolveDay,
  weekStartOf,
  weekdayOf,
  type Category,
  type IsoDate,
  type ResolvedBlock,
  type ScheduleData,
} from '@dialed/schedule';

// Week lanes, Day cards and Month (Flow 03) as pure view models over resolved days — the same
// packages/schedule.resolveDay the Day screen uses, so overrides and effective dates apply everywhere.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WDF = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Lane axis: fixed 8 am → midnight for every day (prototype `lanesData`). */
const AXIS_START = 480;
const AXIS_SPAN = 960;
/** Month chart scale (prototype: 11.4 pt per hour). */
export const MONTH_PT_PER_HOUR = 11.4;

export interface Now {
  date: IsoDate;
  minute: number;
}
export interface Theme {
  isLight: boolean;
}

const dayNum = (d: IsoDate) => Number(d.slice(8, 10));
const monthIdx = (d: IsoDate) => Number(d.slice(5, 7)) - 1;
const color = (c: Category | null, t: Theme) =>
  c ? (t.isLight ? c.color_light : c.color_dark) : '#999999';
const hoursText = (min: number) => formatHours(min).replace('h', '') + 'h';
const isLife = (c: Category | null) => c?.group_name === 'Life';
const work = (b: ResolvedBlock) => !b.quiet;

/** "Oct 19–25", "Oct 26–Nov 1", "Dec 28–Jan 3". */
export function rangeLabel(start: IsoDate): string {
  const end = addDays(start, 6);
  const a = `${MONTHS[monthIdx(start)]} ${dayNum(start)}`;
  return monthIdx(end) === monthIdx(start)
    ? `${a}–${dayNum(end)}`
    : `${a}–${MONTHS[monthIdx(end)]} ${dayNum(end)}`;
}

function minutesBy(blocks: ResolvedBlock[]) {
  const per = new Map<string, { cat: Category | null; min: number }>();
  for (const b of blocks.filter(work)) {
    const cur = per.get(b.category_id) ?? { cat: b.category, min: 0 };
    cur.min += b.end_min - b.start_min;
    per.set(b.category_id, cur);
  }
  return per;
}

/**
 * Category order for the legend, month stacks and mini bars: by the period's work hours, Life categories
 * last. (The prototype hand-orders its legend; this keeps the order true to whatever the data is.)
 */
function categoryOrder(
  days: ResolvedBlock[][],
): { id: string; cat: Category | null; min: number }[] {
  const total = minutesBy(days.flat());
  return [...total.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort(
      (a, b) =>
        Number(isLife(a.cat)) - Number(isLife(b.cat)) ||
        b.min - a.min ||
        (a.cat?.sort ?? 0) - (b.cat?.sort ?? 0),
    );
}

// ---------------- Week lanes ----------------

export interface LaneSeg {
  key: string;
  left: number; // % of the 8 am–midnight axis
  width: number; // %
  color: string;
  past: boolean;
}
export interface Lane {
  date: IsoDate;
  wd: string;
  numeral: string;
  today: boolean;
  segs: LaneSeg[];
  now: number | null; // % position of the now marker (today only)
  summary: string;
  total: string;
  totalMin: number;
  a11y: string;
}
export interface WeekModel {
  start: IsoDate;
  label: string;
  title: string;
  planned: string;
  plannedMin: number;
  lanes: Lane[];
  legend: { name: string; color: string }[];
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function weekModel(data: ScheduleData, start: IsoDate, now: Now, t: Theme): WeekModel {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const days = dates.map((d) => resolveDay(d, data).blocks);
  const lanes = dates.map((date, i): Lane => {
    const blocks = days[i]!;
    const today = date === now.date;
    const per = minutesBy(blocks);
    const totalMin = [...per.values()].reduce((s, v) => s + v.min, 0);
    const top = [...per.values()]
      .filter((v) => !isLife(v.cat))
      .sort((a, b) => b.min - a.min)
      .slice(0, 2)
      .map((v) => `${v.cat?.name ?? 'Other'} ${hoursText(v.min)}`)
      .join(', ');
    const segs = blocks
      .filter((b) => b.end_min > AXIS_START)
      .map((b) => {
        const a = Math.max(b.start_min, AXIS_START);
        return {
          key: b.key,
          left: r2(((a - AXIS_START) / AXIS_SPAN) * 100),
          width: r2(((b.end_min - a) / AXIS_SPAN) * 100 - 0.4),
          color: color(b.category, t),
          past: today && b.end_min <= now.minute,
        };
      });
    const total = hoursText(totalMin);
    return {
      date,
      wd: WD[i]!,
      numeral: String(dayNum(date)),
      today,
      segs,
      now: today ? Math.round(((now.minute - AXIS_START) / AXIS_SPAN) * 1000) / 10 : null,
      summary: today ? (top ? `Today, ${top}` : 'Today') : top,
      total,
      totalMin,
      a11y: `${WDF[i]} ${dayNum(date)}${today ? ', today' : ''}, ${total.replace('h', '')} hours. Open in detail.`,
    };
  });
  const plannedMin = lanes.reduce((s, l) => s + l.totalMin, 0);
  return {
    start,
    label: `Week ${isoWeekNumber(start)}`,
    title: rangeLabel(start),
    planned: `${Math.round(plannedMin / 60)}h planned`,
    plannedMin,
    lanes,
    legend: categoryOrder(days).map((c) => ({
      name: c.cat?.name ?? 'Other',
      color: color(c.cat, t),
    })),
  };
}

// ---------------- Day cards ----------------

export interface CardRow {
  key: string;
  time: string;
  title: string;
  duration: string;
  color: string;
  past: boolean;
  current: boolean;
}
export interface Card {
  date: IsoDate;
  label: string;
  a11y: string;
  numeral: string;
  total: string;
  today: boolean;
  rows: CardRow[];
}
export interface Tile {
  value: string;
  label: string;
  color: string;
}

export function cardsModel(data: ScheduleData, start: IsoDate, now: Now, t: Theme) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const days = dates.map((d) => resolveDay(d, data).blocks);
  const cards = dates.map((date, i): Card => {
    const today = date === now.date;
    const blocks = days[i]!.filter(work);
    const total = hoursText(blocks.reduce((s, b) => s + b.end_min - b.start_min, 0));
    return {
      date,
      label: today ? 'Today' : WDF[i]!,
      a11y: `${WDF[i]} ${dayNum(date)}${today ? ', today' : ''}, ${total.replace('h', '')} hours`,
      numeral: String(dayNum(date)),
      total,
      today,
      rows: blocks.map((b) => {
        const current = today && b.start_min <= now.minute && now.minute < b.end_min;
        return {
          key: b.key,
          time: formatClock(b.start_min).replace(/ (am|pm)$/, ''),
          title: b.title,
          duration: current
            ? `${formatDuration(b.end_min - now.minute)} left`
            : formatDuration(b.end_min - b.start_min),
          color: color(b.category, t),
          past: today && b.end_min <= now.minute,
          current,
        };
      }),
    };
  });
  // Tiles: Projects per category; School as one total; Life categories as "days with it" (Gym "6x").
  const order = categoryOrder(days);
  const tiles: Tile[] = [];
  let school: Tile | null = null;
  let schoolMin = 0;
  for (const c of order) {
    if (c.cat?.group_name === 'School') {
      schoolMin += c.min;
      school ??= { value: '', label: 'School', color: color(c.cat, t) };
      if (!tiles.includes(school)) tiles.push(school);
    } else if (isLife(c.cat)) {
      const n = days.filter((d) => d.some((b) => b.category_id === c.id)).length;
      tiles.push({ value: `${n}x`, label: c.cat?.name ?? 'Other', color: color(c.cat, t) });
    } else {
      tiles.push({
        value: hoursText(c.min),
        label: c.cat?.name ?? 'Other',
        color: color(c.cat, t),
      });
    }
  }
  if (school) school.value = hoursText(schoolMin);
  // Hour tiles by their totals, Life (day-count) tiles last.
  const mins = (x: Tile) => (x.value.endsWith('x') ? -1 : parseFloat(x.value));
  tiles.sort(
    (a, b) => Number(a.value.endsWith('x')) - Number(b.value.endsWith('x')) || mins(b) - mins(a),
  );
  return { start, label: `Week ${isoWeekNumber(start)}`, title: rangeLabel(start), cards, tiles };
}

// ---------------- Month ----------------

export interface MonthDay {
  date: IsoDate;
  day: number;
  past: boolean;
  today: boolean;
  segs: { name: string; hours: number; color: string }[]; // bottom → top
  totalMin: number;
}
export interface MonthWeek {
  start: IsoDate;
  label: string;
  total: string;
  current: boolean;
  past: boolean;
  bar: { width: number; color: string }[];
  a11y: string;
}

export function monthModel(data: ScheduleData, month: string /* YYYY-MM */, now: Now, t: Theme) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const first = `${month}-01`;
  const dates = Array.from({ length: daysInMonth }, (_, i) => addDays(first, i));
  const resolved = dates.map((d) => resolveDay(d, data).blocks);
  const order = categoryOrder(resolved).map((c) => c.id);
  let plannedMin = 0;
  let doneMin = 0;
  const days = dates.map((date, i): MonthDay => {
    const blocks = resolved[i]!.filter(work);
    const per = minutesBy(blocks);
    const totalMin = [...per.values()].reduce((s, v) => s + v.min, 0);
    plannedMin += totalMin;
    // Done = work that ended before now this month (Flow 03 "Derived").
    if (date < now.date) doneMin += totalMin;
    else if (date === now.date)
      doneMin += blocks
        .filter((b) => b.end_min <= now.minute)
        .reduce((s, b) => s + b.end_min - b.start_min, 0);
    return {
      date,
      day: i + 1,
      past: date < now.date,
      today: date === now.date,
      totalMin,
      segs: order
        .filter((id) => per.has(id))
        .map((id) => ({
          name: per.get(id)!.cat?.name ?? 'Other',
          hours: per.get(id)!.min / 60,
          color: color(per.get(id)!.cat, t),
        })),
    };
  });
  // Axis: the 1st, each week start (Monday), the last day, plus days with a noted one-off change (holidays).
  const notes = new Map<number, string>();
  for (const o of data.overrides) {
    if (!o.deleted_at && o.note && o.on_date.startsWith(month))
      notes.set(dayNum(o.on_date), o.note);
  }
  const { numbers: axis, notes: axisNotes } = axisMarks({
    daysInMonth,
    notes,
    mondays: dates.filter((d) => weekdayOf(d) === 0).map(dayNum),
    today: now.date.startsWith(month) ? dayNum(now.date) : null,
  });

  // Weeks overlapping the month (weeks start Monday, D-30).
  const weekStarts: IsoDate[] = [];
  for (let s = weekStartOf(first); s <= dates[dates.length - 1]!; s = addDays(s, 7))
    weekStarts.push(s);
  const thisWeek = weekStartOf(now.date);
  const weekData = weekStarts.map((s) => {
    const blocks = Array.from(
      { length: 7 },
      (_, i) => resolveDay(addDays(s, i), data).blocks,
    ).flat();
    const per = minutesBy(blocks);
    return { s, per, total: [...per.values()].reduce((a, v) => a + v.min, 0) };
  });
  const max = Math.max(1, ...weekData.map((w) => w.total));
  const weeks = weekData.map(({ s, per, total }): MonthWeek => ({
    start: s,
    label: rangeLabel(s),
    total: hoursText(total),
    current: s === thisWeek,
    past: s < thisWeek,
    bar: order
      .filter((id) => per.has(id))
      .map((id) => ({ width: (per.get(id)!.min / max) * 100, color: color(per.get(id)!.cat, t) })),
    a11y: `${rangeLabel(s).replace('–', ' to ')}, ${hoursText(total).replace('h', '')} hours${s === thisWeek ? ', this week' : ''}. Open the week.`,
  }));
  const toGo = now.date.startsWith(month)
    ? daysInMonth - dayNum(now.date)
    : now.date < first
      ? daysInMonth
      : 0;
  return {
    month: MONTHS[m - 1]!,
    year: String(y),
    planned: `${Math.round(plannedMin / 60)}h planned`,
    done: `${Math.round(doneMin / 60)}h done`,
    toGo: `${toGo} ${toGo === 1 ? 'day' : 'days'} to go`,
    days,
    axis,
    axisNotes,
    weeks,
    maxDayMin: Math.max(1, ...days.map((d) => d.totalMin)),
  };
}

/**
 * Month axis day numbers by priority — today, days with a noted one-off change (holidays), the 1st and last
 * day, then Mondays — skipping any that would overlap one already placed (≈0.55 day per character on a
 * 31-column chart). Notes ("Thanksgiving") go on their own row under the numbers.
 */
export function axisMarks(o: {
  daysInMonth: number;
  notes: Map<number, string>;
  mondays: number[];
  today: number | null;
}) {
  const candidates = [
    ...(o.today ? [o.today] : []),
    ...o.notes.keys(),
    1,
    o.daysInMonth,
    ...o.mondays,
  ];
  const placed: { day: number; start: number; end: number }[] = [];
  for (const day of candidates) {
    if (placed.some((p) => p.day === day)) continue;
    const width = String(day).length * 0.55 + 0.6;
    const start = day === o.daysInMonth ? day - width + 1 : day;
    const end = start + width;
    if (placed.some((p) => start < p.end && p.start < end)) continue;
    placed.push({ day, start, end });
  }
  const left = (day: number) => ((day - 1) / o.daysInMonth) * 100;
  return {
    numbers: placed
      .map((p) => p.day)
      .sort((a, b) => a - b)
      .map((day) => ({ day, left: left(day), label: String(day), today: day === o.today })),
    notes: [...o.notes.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, label]) => ({ day, left: left(day), label })),
  };
}
