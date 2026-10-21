import { resolveRange } from './resolve';
import { weekStartOf } from './dates';
import type { IsoDate, ResolvedBlock, ScheduleData } from './types';

/** Work minutes (quiet blocks excluded, schedule-model contract). */
export function workMinutes(blocks: ResolvedBlock[]): number {
  return blocks.filter((b) => !b.quiet).reduce((sum, b) => sum + (b.end_min - b.start_min), 0);
}

export function weekWorkMinutes(anyDateInWeek: IsoDate, data: ScheduleData): number {
  return resolveRange(weekStartOf(anyDateInWeek), 7, data).reduce(
    (s, d) => s + workMinutes(d.blocks),
    0,
  );
}

/** Hours in tenths, rounded half-up (integer math: no float drift). 3855 min → 643. */
export function hoursTenths(minutes: number): number {
  return Math.floor((Math.round(minutes) + 3) / 6);
}

/** "64.3h", "2h", "0h" — half-up to 0.1 h everywhere. */
export function formatHours(minutes: number): string {
  const t = hoursTenths(minutes);
  return t % 10 === 0 ? `${t / 10}h` : `${Math.floor(t / 10)}.${t % 10}h`;
}

export interface CategoryTotal {
  category_id: string;
  minutes: number;
}

export function categoryTotals(blocks: ResolvedBlock[]): CategoryTotal[] {
  const m = new Map<string, number>();
  for (const b of blocks)
    if (!b.quiet) m.set(b.category_id, (m.get(b.category_id) ?? 0) + b.end_min - b.start_min);
  return [...m]
    .map(([category_id, minutes]) => ({ category_id, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}
