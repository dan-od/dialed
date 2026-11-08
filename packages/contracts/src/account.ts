import { z } from 'zod';

/** This phone's notification and lock-screen prefs (Flow 09, D-24). Quiet hours live on the profile. */
export const DevicePrefs = z.strictObject({
  /** live = Live Activity during work blocks; line = Line only (D-07). */
  lock_mode: z.enum(['live', 'line']),
  line_on: z.boolean(),
  heads_up_min: z.union([z.null(), z.literal(5), z.literal(10)]),
  meal_notes: z.boolean(),
  plan_pushes: z.boolean(),
  daily_cap: z.number().int().min(1).max(20),
});
export type DevicePrefs = z.infer<typeof DevicePrefs>;

export const DEFAULT_DEVICE_PREFS: DevicePrefs = {
  lock_mode: 'live',
  line_on: true,
  heads_up_min: null,
  meal_notes: false,
  plan_pushes: true,
  daily_cap: 6,
};

/** APNs device and Live Activity tokens are hex; null clears one (notifications or Live Activities turned off). */
const ApnsToken = z
  .string()
  .regex(/^[0-9a-fA-F]{32,400}$/)
  .nullable();

export const DevicePut = z.strictObject({
  prefs: DevicePrefs.partial().optional(),
  app_version: z.string().max(40).optional(),
  platform: z.enum(['ios', 'android']).optional(),
  apns_token: ApnsToken.optional(),
  /** ActivityKit push-to-start token (iOS 17.2+). */
  live_activity_start_token: ApnsToken.optional(),
});
export const DeviceResponse = z.object({ device_id: z.uuid().optional(), prefs: DevicePrefs });

/** `<routine_block_id|override_id>:<YYYY-MM-DD>` (ResolvedBlock.key, live_activities.block_key). */
export const BLOCK_KEY = /^[0-9a-f-]{36}:\d{4}-\d{2}-\d{2}$/;

/** PUT /v1/devices/current/activities/:blockKey — the phone reports an activity it started or the Planner dismissed. */
export const ActivityPut = z.strictObject({
  /** Per-activity update/end token. */
  push_token: ApnsToken.optional(),
  state: z.enum(['started', 'dismissed']),
});

export const EXPORT_SCHEMA = 'dialed-export/v1';
/** Exports per user per day (Flow 09). */
export const EXPORTS_PER_DAY = 3;
