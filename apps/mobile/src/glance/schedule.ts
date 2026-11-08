import type { DevicePrefs } from '@dialed/contracts';
import type { ScheduleData } from '@dialed/schedule';
import * as Notifications from 'expo-notifications';
import { notificationPermission } from '../notifications/reminders';
import { planReminders, type PlannedReminder } from './plan';

/** Local notes on this phone (D-39: no APNs on the free account): ids `reminder:<blockKey>[:snooze]`. */
const REMINDER_PREFIX = 'reminder:';
export const SNOOZE_MIN = 10;

let categoriesReady: Promise<void> | null = null;

/** BLOCK_REMINDER: "Snooze 10 min" | "Open day" (primary, opens the app). MEAL_NOTE: no actions. */
export function registerNotificationCategories(): Promise<void> {
  categoriesReady ??= Promise.all([
    Notifications.setNotificationCategoryAsync('BLOCK_REMINDER', [
      {
        identifier: 'SNOOZE_10',
        buttonTitle: 'Snooze 10 min',
        options: { opensAppToForeground: false },
      },
      { identifier: 'OPEN_DAY', buttonTitle: 'Open day', options: { opensAppToForeground: true } },
    ]),
    Notifications.setNotificationCategoryAsync('MEAL_NOTE', []),
  ])
    .then(() => {})
    .catch((e: unknown) => {
      categoriesReady = null; // try again next time
      throw e;
    });
  return categoriesReady;
}

function content(r: PlannedReminder): Notifications.NotificationContentInput {
  const meal = r.category === 'MEAL_NOTE';
  return {
    title: r.title,
    body: r.body,
    categoryIdentifier: r.category,
    data: { block_key: r.blockKey },
    // Meal and break notes: no sound, no banner over other apps (Flow 08 / prototype notification settings).
    ...(meal ? { interruptionLevel: 'passive' as const, sound: false } : {}),
  };
}

async function cancelReminderNotifications() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    if (n.identifier.startsWith(REMINDER_PREFIX))
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
}

/**
 * Replace this phone's scheduled notes with the next 48 h (Flow 08 `glance.scheduleNotifications`): block
 * alerts, heads-ups and meal notes; quiet hours from the profile; capped per day (oldest first).
 */
export async function scheduleNotifications(
  data: ScheduleData,
  alerts: Record<string, number>,
  timeZone: string,
  quiet: { start: number; end: number },
  prefs?: DevicePrefs,
  now: Date = new Date(),
) {
  if ((await notificationPermission()) !== 'granted') return;
  await registerNotificationCategories().catch(() => {});
  const planned = planReminders(data, alerts, now, timeZone, quiet, prefs);
  await cancelReminderNotifications();
  for (const r of planned) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_PREFIX}${r.blockKey}`,
      content: content(r),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
    });
  }
}

/** Sign-out (identity-session): no notes for an account that left this phone. */
export async function cancelNotifications() {
  await cancelReminderNotifications().catch(() => {});
}

/**
 * A tap on one of our notes. Snooze reschedules the same note +10 min (no toast needed, Flow 08); Open day and
 * a plain tap open Day. Other notifications (plan pushes) return null and are handled elsewhere.
 */
export async function handleReminderResponse(
  response: Notifications.NotificationResponse,
  now: Date = new Date(),
): Promise<'snoozed' | 'open_day' | null> {
  const req = response.notification.request;
  if (!req.identifier.startsWith(REMINDER_PREFIX)) return null;
  if (response.actionIdentifier === 'SNOOZE_10') {
    const c = req.content;
    await Notifications.scheduleNotificationAsync({
      identifier: `${req.identifier.replace(/:snooze$/, '')}:snooze`,
      content: {
        title: c.title ?? '',
        body: c.body ?? '',
        categoryIdentifier: c.categoryIdentifier ?? 'BLOCK_REMINDER',
        data: c.data ?? {},
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(now.getTime() + SNOOZE_MIN * 60_000),
      },
    });
    return 'snoozed';
  }
  if (
    response.actionIdentifier === 'OPEN_DAY' ||
    response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
  )
    return 'open_day';
  return null;
}
