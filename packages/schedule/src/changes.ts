import type { Minutes } from './types';

interface Span {
  key?: string;
  title: string;
  start_min: Minutes;
  end_min: Minutes;
  quiet: boolean;
}

/**
 * First work block that [start, end) runs into (Flow 04 overlap warning). Quiet blocks never count,
 * touching edges are fine, and `ignoreKey` leaves out the block being edited.
 */
export function overlapOf<T extends Span>(
  blocks: T[],
  start: Minutes,
  end: Minutes,
  ignoreKey?: string,
): T | null {
  if (end <= start) return null;
  return (
    [...blocks]
      .sort((a, b) => a.start_min - b.start_min)
      .find(
        (b) => !b.quiet && b.key !== (ignoreKey ?? null) && b.start_min < end && start < b.end_min,
      ) ?? null
  );
}

/** Default Add-sheet times: the next free 5-minute slot of `length`, never past midnight. */
export function nextFreeSlot(
  blocks: Span[],
  minute: Minutes,
  length: Minutes = 60,
): { start: Minutes; end: Minutes } {
  const first = Math.ceil(minute / 5) * 5;
  for (let s = first; s + length <= 1440; s += 5) {
    if (!overlapOf(blocks, s, s + length)) return { start: s, end: s + length };
  }
  const start = Math.min(first, 1440 - length);
  return { start, end: start + length };
}
