import { instantAt } from './dates';
import { resolveDay } from './resolve';
import type { IsoDate, ResolvedBlock, ScheduleData } from './types';

/** One work block's Live Activity (BACKEND_SETUP §8): static attributes plus the content state. */
export interface BlockActivity {
  blockKey: string;
  title: string;
  categoryColorHex: string;
  startsAt: Date;
  endsAt: Date;
  /** The next two blocks of any kind: the lock-screen card's segment bar. */
  next: { title: string; startsAt: Date; durationMin: number }[];
}

function toActivity(
  b: ResolvedBlock,
  day: ResolvedBlock[],
  date: IsoDate,
  tz: string,
): BlockActivity {
  return {
    blockKey: b.key,
    title: b.title,
    categoryColorHex: b.category?.color_dark ?? '#FF5A1F',
    startsAt: instantAt(date, b.start_min, tz),
    endsAt: instantAt(date, b.end_min, tz),
    next: day
      .filter((n) => n.key !== b.key && n.start_min >= b.end_min)
      .slice(0, 2)
      .map((n) => ({
        title: n.title,
        startsAt: instantAt(date, n.start_min, tz),
        durationMin: n.end_min - n.start_min,
      })),
  };
}

/** Work blocks of `date` as Live Activities. Quiet blocks (meals, breaks) never get one (D-07). */
export function activitiesForDay(
  data: ScheduleData,
  date: IsoDate,
  timeZone: string,
): BlockActivity[] {
  const blocks = resolveDay(date, data).blocks;
  return blocks
    .filter((b) => !b.quiet && b.end_min > b.start_min)
    .map((b) => toActivity(b, blocks, date, timeZone));
}

/**
 * The activity that should be showing at `now`: the earliest active work block (prototype `nowNext`), or null
 * in a meal, a break or a gap.
 */
export function currentActivity(
  data: ScheduleData,
  date: IsoDate,
  minute: number,
  timeZone: string,
): BlockActivity | null {
  const day = resolveDay(date, data).blocks;
  const cur = day.find((b) => !b.quiet && b.start_min <= minute && minute < b.end_min);
  return cur ? toActivity(cur, day, date, timeZone) : null;
}
