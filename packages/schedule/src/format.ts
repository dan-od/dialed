import type { Minutes } from './types';

/** 760 → "12:40 pm", 540 → "9:00 am", 1440 → "12:00 am". */
export function formatClock(min: Minutes): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
}

/** Axis style: whole hours drop the minutes. 540 → "9 am", 1440 → "12 am", 870 → "2:30 pm". */
export function formatClockShort(min: Minutes): string {
  return min % 60 === 0 ? formatClock(min).replace(':00', '') : formatClock(min);
}

/** Compact range used in lists: 760–870 → "12:40–2:30". */
export function formatRange(start: Minutes, end: Minutes): string {
  const bare = (x: Minutes) => formatClock(x).replace(/ (am|pm)$/, '');
  return `${bare(start)}–${bare(end)}`;
}

/** Countdown "H:MM": 75 → "1:15", 5 → "0:05". */
export function formatCountdown(min: Minutes): string {
  const m = Math.max(0, Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** Durations: 110 → "1h 50m", 60 → "1h", 45 → "45m". */
export function formatDuration(min: Minutes): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Spoken duration for VoiceOver: 75 → "1 hour 15 minutes". */
export function spokenDuration(min: Minutes): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m || !h) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  return parts.join(' ');
}
