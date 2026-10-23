import type { DevicePrefs } from '@dialed/contracts';
import {
  addDays,
  formatClockShort,
  termFor,
  weekStartOf,
  type Category,
  type IsoDate,
  type ScheduleData,
} from '@dialed/schedule';
import { palette } from '@dialed/tokens';
import { planReminders } from '../notifications/plan';
import type { Part } from '../ui/Inline';

// Flow 09 rules and copy (prototype v11 `settings`, `categories`, `catEdit`, `catMerge`, `catDelete`,
// `notifSettings`). Plain counts are singular when they're one (prototype said "1 blocks").

/** The 11 category colours in prototype order (dark, light). */
export const PALETTE = Object.entries(palette).map(([name, [dark, light]]) => ({
  name,
  dark,
  light,
}));
/** Index of a colour pair in the palette; −1 for colours outside it (Meal, Break): Save keeps them. */
export const paletteIndex = (dark: string) =>
  PALETTE.findIndex((p) => p.dark.toLowerCase() === dark.toLowerCase());

export const cleanName = (s: string) => s.trim().replace(/\s+/g, ' ');
/** Another live category already called `name` (ignoring case and extra spaces). */
export function sameName(cats: Category[], name: string, exceptId?: string): Category | null {
  const n = cleanName(name).toLowerCase();
  return (
    cats.find((c) => !c.deleted_at && c.id !== exceptId && cleanName(c.name).toLowerCase() === n) ??
    null
  );
}

export const hoursLabel = (h: number) => `${Math.round(h * 10) / 10}h`;

/** Hours and routine blocks per category in this week of the active term's routine (quiet ones count too). */
export function categoryWeek(
  data: ScheduleData,
  today: IsoDate,
): Map<string, { hours: number; blocks: number }> {
  const out = new Map<string, { hours: number; blocks: number }>();
  const term = termFor(today, data.terms);
  const routine = term && data.routines.find((r) => r.term_id === term.id);
  if (!routine) return out;
  const week = weekStartOf(today);
  for (const b of data.routineBlocks) {
    if (b.routine_id !== routine.id || b.deleted_at) continue;
    const date = addDays(week, b.weekday);
    if (b.effective_from > date || (b.effective_to !== null && date >= b.effective_to)) continue;
    const cur = out.get(b.category_id) ?? { hours: 0, blocks: 0 };
    cur.hours += (b.end_min - b.start_min) / 60;
    cur.blocks += 1;
    out.set(b.category_id, cur);
  }
  return out;
}

export const blocksUseLine = (n: number) =>
  n === 1 ? '1 block a week uses it.' : `${n} blocks a week use it.`;
export const deleteLine = (n: number) =>
  n === 0
    ? 'Nothing uses it right now.'
    : n === 1
      ? '1 block a week uses it. Move it to:'
      : `${n} blocks a week use it. Move them to:`;
export const mergeSub = (n: number, name: string) =>
  `Its ${n} ${n === 1 ? 'block moves' : 'blocks move'} to the category you pick, then ${name} goes away.`;
export const mergedToast = (from: string, to: string, n: number) =>
  `Merged ${from} into ${to}. ${n} ${n === 1 ? 'block' : 'blocks'} moved.`;

/** Moving blocks out of or into a protected category (Class) changes AI protection (ASSUMED copy). */
export function protectedLine(from: Category, to: Category | null): string | null {
  if (!to || from.protected === to.protected) return null;
  return from.protected
    ? `Classes moved to ${to.name} won’t be protected from AI changes.`
    : `Blocks moved to ${to.name} will be protected from AI changes.`;
}

// ----- notifications -----
export const notifValue = (p: Pick<DevicePrefs, 'lock_mode' | 'daily_cap'>) =>
  `${p.lock_mode === 'live' ? 'Live Activity' : 'Off'} · max ${p.daily_cap}`;
export const clampCap = (n: number) => Math.max(1, Math.min(20, n));
/** "12 am – 7:30 am": en dash, minutes only when they aren't :00. */
export const quietHoursText = (start: number, end: number) =>
  `${formatClockShort(start % 1440)} – ${formatClockShort(end % 1440)}`;

/** Notifications left today with these prefs: the phone's own planner (heads-up, meal notes, alerts, cap). */
export function notifCount(
  data: ScheduleData,
  alerts: Record<string, number>,
  prefs: DevicePrefs,
  now: Date,
  timeZone: string,
  quiet: { start: number; end: number },
): number {
  const planned = planReminders(data, alerts, now, timeZone, quiet, prefs);
  const today = planned.filter((r) => r.blockKey.endsWith(`:${dateIn(now, timeZone)}`));
  return Math.min(today.length, prefs.daily_cap);
}
const dateIn = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/** The live count sentence (Line only drops the Live Activity clause: it would be false). */
export function notifParts(n: number, lockMode: DevicePrefs['lock_mode']): Part[] {
  return [
    'With these settings you’d get ',
    { b: `${n} notification${n === 1 ? '' : 's'}` },
    lockMode === 'live'
      ? ' for the rest of today, plus the Live Activity during work blocks.'
      : ' for the rest of today.',
  ];
}
