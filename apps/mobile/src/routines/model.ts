import {
  addDays,
  daysBetween,
  formatDuration,
  weekdayOf,
  weekStartOf,
  type IsoDate,
  type Override,
  type ScheduleData,
  type Term,
} from '@dialed/schedule';
import { WEEKDAY_SHORT, WEEKDAYS } from '../blocks/form';

// Flow 05 copy and rules (prototype v9, Flow_05 file, BACKEND_SETUP §3 effective dates). Pure, so it's tested.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 26" */
export const shortDate = (d: IsoDate) =>
  `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
/** "Monday, Oct 26" */
const longDate = (d: IsoDate) => `${WEEKDAYS[weekdayOf(d)]}, ${shortDate(d)}`;
/** "Mon Oct 26" */
const toastDate = (d: IsoDate) => `${WEEKDAY_SHORT[weekdayOf(d)]} ${shortDate(d)}`;

type TermLike = Pick<Term, 'name' | 'starts_on' | 'ends_on' | 'is_draft'> & {
  deleted_at?: string | null;
};

export type TermStatus = 'Active' | 'Next' | 'Draft' | 'Past';
/** The draft flag wins; otherwise by date (BACKEND_SETUP §3 "Term status"). */
export function termStatus(t: TermLike, today: IsoDate): TermStatus {
  if (t.is_draft) return 'Draft';
  if (t.ends_on < today) return 'Past';
  if (t.starts_on > today) return 'Next';
  return 'Active';
}

export const dateRange = (t: TermLike) => `${shortDate(t.starts_on)} to ${shortDate(t.ends_on)}`;

export function otherTermLine(t: TermLike, active: TermLike | null): string {
  if (t.is_draft) return `Draft, from ${shortDate(t.starts_on)}. Add your new classes`;
  if (active && addDays(active.ends_on, 1) === t.starts_on)
    return `${dateRange(t)}, starts after ${active.name}`;
  return dateRange(t);
}

export type TermNotice =
  { kind: 'gap'; after: string; text: string } | { kind: 'overlap'; on: string; text: string };
/** Gaps between consecutive terms and overlaps (the earlier start wins). */
export function termNotices(terms: TermLike[]): TermNotice[] {
  const live = terms
    .filter((t) => !t.deleted_at)
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const out: TermNotice[] = [];
  for (let i = 1; i < live.length; i++) {
    const a = live[i - 1]!;
    const b = live[i]!;
    if (b.starts_on <= a.ends_on)
      out.push({
        kind: 'overlap',
        on: a.name,
        text: `Overlaps ${b.name}. Days in both use ${a.name}.`,
      });
    else if (addDays(a.ends_on, 1) < b.starts_on)
      out.push({
        kind: 'gap',
        after: a.name,
        text: `${shortDate(addDays(a.ends_on, 1))} – ${shortDate(addDays(b.starts_on, -1))} has no term. Those days stay empty unless you add something.`,
      });
  }
  return out;
}

export const termDateError = (starts: IsoDate, ends: IsoDate) =>
  ends < starts ? 'Ends needs to be after starts.' : null;

// ----- routine editor -----
export const editorStatus = (dirty: boolean) =>
  dirty ? 'Unsaved changes' : 'Changes start next Monday';
/** 10.4 → "10.4h", 5 → "5h" */
export const hoursText = (h: number) => `${Number(h.toFixed(1))}h`;
export const dayTabLabel = (wd: number, h: number) =>
  `${WEEKDAYS[wd]}, ${Number(h.toFixed(1))} hours`;
export const emptyDayLine = (wd: number) =>
  `Nothing repeats on ${WEEKDAYS[wd]}s yet. Add the first block below.`;
export const removedToast = (title: string, wd: number) =>
  `Removed ${title} from ${WEEKDAYS[wd]}s.`;
export const addToDayLabel = (wd: number) => `Add to ${WEEKDAY_SHORT[wd]}s`;
export const copyDayLabel = (wd: number) => `Copy ${WEEKDAY_SHORT[wd]} to…`;
export const copyToast = (from: number, to: number[]) =>
  `Copied ${WEEKDAYS[from]} to ${to.map((t) => WEEKDAY_SHORT[t]).join(', ')}. Save to keep it.`;
/** Live line under the copy checkboxes: which days lose blocks. */
export function replacesLine(days: number[]): string | null {
  if (!days.length) return null;
  const names = days.map((d) => WEEKDAY_SHORT[d]!);
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `Replaces what’s on ${list}.`;
}

// ----- save sheet -----
/** BACKEND_SETUP §3: routine editor save defaults to next Monday; the Planner can pick today or a date. */
export const effectiveChoices = (today: IsoDate) => ({
  nextMonday: addDays(weekStartOf(today), 7),
  today,
});
export function saveSentence(effective: IsoDate, today: IsoDate): string {
  if (effective === today) return 'Changes start today. Earlier days stay as they were.';
  if (effective === effectiveChoices(today).nextMonday)
    return `Changes start ${longDate(effective)}. This week and earlier stay as they were.`;
  return `Changes start ${longDate(effective)}. Days before then stay as they were.`;
}
export function saveToast(name: string, effective: IsoDate, today: IsoDate, online: boolean) {
  if (!online) return 'Saved on this phone. It syncs when you reconnect.';
  return `${name} saved. Changes start ${effective === today ? 'today' : toastDate(effective)}.`;
}

// ----- name your term (D-35) -----
export const nameTermDefaults = (today: IsoDate) => ({
  name: 'Fall term',
  starts: today,
  ends: addDays(today, 13 * 7),
});
export function weeksHelper(starts: IsoDate, ends: IsoDate): string {
  const w = Math.max(1, Math.round(daysBetween(starts, ends) / 7));
  return `${w} ${w === 1 ? 'week' : 'weeks'}. “Rest of the year” still means Dec 31.`;
}
export function nameTermError(name: string, starts: IsoDate, ends: IsoDate): string | null {
  if (!name.trim()) return 'Give the term a name, like “Fall term”.';
  if (!starts || !ends || ends <= starts) return 'Ends needs to be after starts.';
  return null;
}

// ----- one-off changes -----
export interface OneOffRow {
  date: IsoDate;
  label: string;
  title: string;
  line: string;
}
/** A date's overrides as one row: its note (or "One-off change") and a short summary; newest first. */
export function oneOffChanges(overrides: Override[], limit = 5): OneOffRow[] {
  const byDate = new Map<IsoDate, Override[]>();
  for (const o of overrides) {
    if (o.deleted_at) continue;
    byDate.set(o.on_date, [...(byDate.get(o.on_date) ?? []), o]);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([date, os]) => {
      const parts: string[] = [];
      const skips = os.filter((o) => o.kind === 'skip').length;
      if (skips) parts.push(`${skips} ${skips === 1 ? 'block' : 'blocks'} skipped`);
      for (const o of os.filter((x) => x.kind === 'add'))
        parts.push(
          `${o.title} ${o.start_min !== null && o.end_min !== null ? `${formatDuration(o.end_min - o.start_min)} ` : ''}added`,
        );
      const moved = os.filter((o) => o.kind === 'move').length;
      if (moved) parts.push(`${moved} moved`);
      const changed = os.filter((o) => o.kind === 'modify').length;
      if (changed) parts.push(`${changed} changed`);
      return {
        date,
        label: shortDate(date),
        title: os.find((o) => o.note)?.note ?? 'One-off change',
        line: parts.join(' · '),
      };
    });
}

// ----- routines card -----
/** Hours of work per day (Mon → Sun) the routine puts in the week starting `weekStart` (each day's own versions;
 * meals and breaks don't count). */
export function routineDayHours(
  data: ScheduleData,
  routineId: string,
  weekStart: IsoDate,
): number[] {
  const quiet = new Set(data.categories.filter((c) => c.quiet).map((c) => c.id));
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    const date = addDays(weekStart, d);
    let min = 0;
    for (const b of data.routineBlocks) {
      if (b.routine_id !== routineId || b.deleted_at || b.weekday !== d || quiet.has(b.category_id))
        continue;
      if (b.effective_from <= date && (b.effective_to === null || date < b.effective_to))
        min += b.end_min - b.start_min;
    }
    return min / 60;
  });
}
export const routineWeekHours = (data: ScheduleData, routineId: string, weekStart: IsoDate) =>
  routineDayHours(data, routineId, weekStart).reduce((a, b) => a + b, 0);

/** "64h → 63h from Mon Oct 26" when a saved change starts after this week's hours (null when nothing changes). */
export function routineChangeLine(
  data: ScheduleData,
  routineId: string,
  today: IsoDate,
): string | null {
  const dates = data.routineBlocks
    .filter((b) => b.routine_id === routineId && !b.deleted_at)
    .flatMap((b) => [b.effective_from, b.effective_to])
    .filter((d): d is IsoDate => !!d && d > today)
    .sort();
  const now = routineWeekHours(data, routineId, weekStartOf(today));
  for (const d of dates) {
    const later = routineWeekHours(
      data,
      routineId,
      weekStartOf(d) <= today ? addDays(weekStartOf(d), 7) : weekStartOf(d),
    );
    if (Math.round(later) !== Math.round(now))
      return `${Math.round(now)}h → ${Math.round(later)}h from ${toastDate(d)}`;
  }
  return null;
}
