import type { DevicePrefs, SnapshotBlock } from '@dialed/contracts';
import { SnapshotV1 } from '@dialed/contracts';
import {
  addDays,
  categoryTotals,
  hoursTenths,
  localNow,
  resolveDay,
  resolveRange,
  weekStartOf,
  workMinutes,
  type ResolvedBlock,
  type ScheduleData,
} from '@dialed/schedule';

export { SnapshotV1 };

/** Rundown shows Today and includes meals and breaks until the widget's own options say otherwise (D-84). */
const RUNDOWN_DEFAULT = 'today' as const;
const WIDGET_MEALS = true;

const hours = (minutes: number) => hoursTenths(minutes) / 10;

const block = (b: ResolvedBlock): SnapshotBlock => ({
  key: b.key,
  title: b.title,
  start_min: b.start_min,
  end_min: b.end_min,
  category_id: b.category_id,
  quiet: b.quiet,
});

/**
 * Widget snapshot v1 (C-x08) for `now` in the profile time zone: today and tomorrow, this week's work hours,
 * categories and the lock-screen settings. Pure: the same input gives byte-identical JSON.
 */
export function buildSnapshot(
  data: ScheduleData,
  prefs: Pick<DevicePrefs, 'lock_mode' | 'line_on'>,
  timeZone: string,
  now: Date,
): SnapshotV1 {
  const today = localNow(now, timeZone).date;
  const start = weekStartOf(today);
  const week = resolveRange(start, 7, data);
  const byDay = week.map((d) => hours(workMinutes(d.blocks)));
  const categories: SnapshotV1['categories'] = {};
  for (const c of [...data.categories].sort(
    (a, b) => a.sort - b.sort || a.id.localeCompare(b.id),
  )) {
    if (c.deleted_at) continue;
    categories[c.id] = {
      name: c.name,
      color_dark: c.color_dark,
      color_light: c.color_light,
      quiet: c.quiet,
    };
  }
  return {
    version: 1,
    generated_at: now.toISOString(),
    time_zone: timeZone,
    setup_needed: data.routineBlocks.every((b) => !!b.deleted_at),
    days: [
      { date: today, blocks: resolveDay(today, data).blocks.map(block) },
      { date: addDays(today, 1), blocks: resolveDay(addDays(today, 1), data).blocks.map(block) },
    ],
    week: {
      start,
      hours_by_day: byDay,
      planned_hours: hours(week.reduce((s, d) => s + workMinutes(d.blocks), 0)),
      top_categories: categoryTotals(week.flatMap((d) => d.blocks))
        .slice(0, 3)
        .map((t) => ({ category_id: t.category_id, hours: hours(t.minutes) })),
    },
    categories,
    settings: {
      lock_mode: prefs.lock_mode,
      // Line only keeps the line (D-07).
      line_on: prefs.lock_mode === 'line' ? true : prefs.line_on,
      rundown_default: RUNDOWN_DEFAULT,
      widget_meals: WIDGET_MEALS,
    },
  };
}
