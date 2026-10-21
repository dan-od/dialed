import type { Minutes, ResolvedBlock } from './types';

export type NowState =
  | { kind: 'in'; block: ResolvedBlock; remaining: Minutes; next: ResolvedBlock | null }
  | { kind: 'next'; block: ResolvedBlock; untilStart: Minutes }
  | { kind: 'done' }
  | { kind: 'free' };

/**
 * Hero state at `minute`. Overlaps: the current block is the earliest-starting active work block;
 * a quiet block only counts when no work block is active (Flow 03 sub-interactions).
 */
export function nowState(blocks: ResolvedBlock[], minute: Minutes): NowState {
  if (blocks.length === 0) return { kind: 'free' };
  const active = blocks.filter((b) => b.start_min <= minute && minute < b.end_min);
  const current = active.find((b) => !b.quiet) ?? active[0];
  if (current) {
    const next = blocks.find((b) => b.start_min >= current.end_min && b !== current) ?? null;
    return { kind: 'in', block: current, remaining: current.end_min - minute, next };
  }
  const upcoming = blocks.find((b) => b.start_min > minute);
  if (upcoming) return { kind: 'next', block: upcoming, untilStart: upcoming.start_min - minute };
  return { kind: 'done' };
}

/** Rows for "Rest of today": blocks that haven't started yet (prototype `day` state; the hero shows the current one). */
export function restOfToday(blocks: ResolvedBlock[], minute: Minutes): ResolvedBlock[] {
  return blocks.filter((b) => b.start_min > minute);
}

/** Share of the day bounds already gone, 0–100 (integer). */
export function percentOfDayGone(minute: Minutes, dayStart: Minutes, dayEnd: Minutes): number {
  if (minute <= dayStart) return 0;
  if (minute >= dayEnd) return 100;
  return Math.round(((minute - dayStart) / (dayEnd - dayStart)) * 100);
}
