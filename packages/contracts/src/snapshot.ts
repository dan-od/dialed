import { z } from 'zod';

/**
 * Widget snapshot v1 (contract C-x08): written by the app to the App Group as `snapshot.json`, read by the
 * widget extension (mirrored in targets/widgets/SnapshotReader.swift). Titles, times and colours only: no
 * tokens, ids of other users, or account data (SECURITY.md).
 */
const minute = z.number().int().min(0).max(1440);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SnapshotBlock = z.strictObject({
  /** `<routine_block_id|override_id>:<date>`, the Live Activity blockKey shape. */
  key: z.string(),
  title: z.string(),
  start_min: minute,
  end_min: minute,
  category_id: z.string(),
  quiet: z.boolean(),
});

export const SnapshotDay = z.strictObject({
  date: isoDate,
  blocks: z.array(SnapshotBlock),
});

export const SnapshotV1 = z.strictObject({
  version: z.literal(1),
  generated_at: z.iso.datetime(),
  time_zone: z.string(),
  /** No routine blocks yet: widgets show "Set up your week in Dialed". */
  setup_needed: z.boolean(),
  /** Today and tomorrow, resolved in the profile time zone. */
  days: z.tuple([SnapshotDay, SnapshotDay]),
  week: z.strictObject({
    /** Monday of this week. */
    start: isoDate,
    /** Work hours per day, Monday first, half-up to 0.1 h. */
    hours_by_day: z.array(z.number()).length(7),
    planned_hours: z.number(),
    top_categories: z.array(z.strictObject({ category_id: z.string(), hours: z.number() })).max(3),
  }),
  categories: z.record(
    z.string(),
    z.strictObject({
      name: z.string(),
      color_dark: z.string(),
      color_light: z.string(),
      quiet: z.boolean(),
    }),
  ),
  settings: z.strictObject({
    lock_mode: z.enum(['live', 'line']),
    line_on: z.boolean(),
    rundown_default: z.enum(['today', 'week']),
    widget_meals: z.boolean(),
  }),
});
export type SnapshotV1 = z.infer<typeof SnapshotV1>;
export type SnapshotBlock = z.infer<typeof SnapshotBlock>;

/** Older than this, widgets grey the data and say "Open Dialed to refresh" (Flow 08). */
export const SNAPSHOT_STALE_HOURS = 26;
