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

export const DevicePut = z.strictObject({
  prefs: DevicePrefs.partial().optional(),
  app_version: z.string().max(40).optional(),
});
export const DeviceResponse = z.object({ prefs: DevicePrefs });

export const EXPORT_SCHEMA = 'dialed-export/v1';
/** Exports per user per day (Flow 09). */
export const EXPORTS_PER_DAY = 3;
