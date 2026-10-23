import { formatClock } from '@dialed/schedule';
import { APP_NAME } from '../config';
import type { AlertChoice } from './service';

// Flow 04 form rules and copy (prototype v8 §3–§11; Flow_04 states; D-32). Pure, so every string is tested.

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const LENGTHS = [
  { min: 30, label: '30m' },
  { min: 60, label: '1h' },
  { min: 90, label: '1h 30m' },
  { min: 120, label: '2h' },
] as const;
/** D-32: no alert unless the Planner picks one (work blocks get a Live Activity instead). */
export const ALERTS: { value: AlertChoice; label: string }[] = [
  { value: null, label: 'Default (off)' },
  { value: 0, label: 'When it starts' },
  { value: 10, label: '10 min before' },
  { value: 30, label: '30 min before' },
];
export type Perm = 'undetermined' | 'granted' | 'denied';

export interface AddForm {
  title: string;
  category_id: string | null;
  start: number;
  end: number;
  repeat: boolean;
  alert: AlertChoice;
  /** The overlap warning was seen once (first tap); the next tap adds anyway. */
  overlapOk: boolean;
}
export interface AddErrors {
  title?: string;
  category?: string;
  time?: string;
}

export function validateAdd(
  f: Pick<AddForm, 'title' | 'category_id' | 'start' | 'end'>,
): AddErrors {
  const e: AddErrors = {};
  const title = f.title.trim();
  if (!title) e.title = 'Give the block a name, like “Capstone reading”.';
  else if (title.length > 80) e.title = 'Keep the name under 80 characters.';
  if (!f.category_id) e.category = 'Pick a category so it gets the right colour and totals.';
  const time = timeError(f.start, f.end);
  if (time) e.time = time;
  return e;
}

export const timeError = (start: number, end: number) =>
  end <= start ? `End time needs to be after ${formatClock(start)}.` : null;

type Times = { start: number; end: number };
/** Moving Starts keeps the length (at least 15 min); Ends never passes midnight. */
export function setStart(t: Times, start: number): Times {
  const len = Math.max(t.end - t.start, 15);
  return { start, end: Math.min(1440, start + len) };
}
/** The picker's 12:00 am as an end time is midnight (24:00). */
export function setEnd(t: Times, end: number): Times {
  return { start: t.start, end: end === 0 ? 1440 : end };
}
export function setLength(t: Times, len: number): Times {
  return { start: t.start, end: Math.min(1440, t.start + len) };
}
export const lengthChip = (t: Times) => LENGTHS.find((l) => l.min === t.end - t.start)?.min ?? null;

export const overlapSpoken = (title: string) =>
  `This overlaps ${title}. Press Add anyway to keep both.`;

export function addPrimaryLabel(s: {
  overlap: boolean;
  overlapOk: boolean;
  saving: boolean;
  /** Flow 05 routine mode ("Add to Mons"). */
  routine?: boolean;
}) {
  if (s.saving) return 'Adding';
  if (s.overlap && s.overlapOk) return 'Add anyway';
  return s.routine ? 'Add to routine' : 'Add block';
}

export function addToast(s: {
  weekday: string;
  repeat: boolean;
  online: boolean;
  alert: AlertChoice;
  perm: Perm;
}): string {
  if (!s.online) return 'Saved on this phone. It syncs when you’re back online.';
  if (s.alert !== null && s.perm === 'denied')
    return `Added. Reminders are off for ${APP_NAME} in Settings.`;
  const msg = `Added to ${s.repeat ? 'every ' : ''}${s.weekday}.`;
  if (s.alert !== null && s.perm === 'granted')
    return `${msg} You’ll get a nudge ${s.alert === 0 ? 'when it starts' : `${s.alert} min before`}.`;
  return msg;
}

export interface EditState {
  title: string;
  start: number;
  end: number;
  category_id: string;
  /** Day chip index, Mon = 0. */
  day: number;
}
export function editPrimaryLabel(o: EditState, e: EditState) {
  const changed =
    e.title.trim() !== o.title ||
    e.start !== o.start ||
    e.end !== o.end ||
    e.category_id !== o.category_id ||
    e.day !== o.day;
  if (!changed) return { label: 'No changes yet', disabled: true };
  if (e.day !== o.day) return { label: `Move to ${WEEKDAYS[e.day]}`, disabled: false };
  return { label: 'Save changes', disabled: false };
}

type EditCtx = {
  routine: boolean;
  scope: 'once' | 'every';
  today: number;
  day: number;
  title: string;
  online: boolean;
};
/** "Skip it this <weekday>" (routine, this day only) or "Delete block". */
export function removeOutcome(s: Pick<EditCtx, 'routine' | 'scope' | 'today' | 'title'>) {
  const wd = WEEKDAYS[s.today];
  return s.routine && s.scope === 'once'
    ? {
        kind: 'skip' as const,
        label: `Skip it this ${wd}`,
        toast: `Skipped ${s.title} this ${wd}.`,
      }
    : { kind: 'delete' as const, label: 'Delete block', toast: `Deleted ${s.title}.` };
}

export function editOutcome(s: EditCtx) {
  const wd = WEEKDAYS[s.today];
  const every = s.routine && s.scope === 'every';
  let r: { kind: 'modifyOnce' | 'modifyEvery' | 'moveOnce' | 'moveEvery'; toast: string };
  if (s.day !== s.today)
    r = every
      ? { kind: 'moveEvery', toast: `Moved to every ${WEEKDAYS[s.day]}.` }
      : { kind: 'moveOnce', toast: `Moved to ${WEEKDAYS[s.day]}, this week only.` };
  else if (every) r = { kind: 'modifyEvery', toast: `Updated every ${wd}.` };
  else r = { kind: 'modifyOnce', toast: s.routine ? `Changed for this ${wd} only.` : 'Updated.' };
  if (!s.online) r.toast += ' Syncs when you’re back online.';
  return r;
}
