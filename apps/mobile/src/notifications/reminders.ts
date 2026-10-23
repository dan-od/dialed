import type { DevicePrefs } from '@dialed/contracts';
import type { ScheduleData } from '@dialed/schedule';
import * as Notifications from 'expo-notifications';
import type { Perm } from '../blocks/form';
import { planReminders } from './plan';

// Local reminders only (D-39: no APNs on the free account). Flow 08 adds the BLOCK_REMINDER actions.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const asPerm = (p: Notifications.NotificationPermissionsStatus): Perm =>
  p.granted ? 'granted' : p.status === 'undetermined' && p.canAskAgain ? 'undetermined' : 'denied';

export async function notificationPermission(): Promise<Perm> {
  return asPerm(await Notifications.getPermissionsAsync());
}

/** The one-time iOS prompt; only after "Turn on reminders" in the Get a nudge sheet. */
export async function requestNotificationPermission(): Promise<Perm> {
  return asPerm(
    await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    }),
  );
}

/** Replace this phone's scheduled reminders with the next 48 h: block alerts, heads-ups and meal notes. */
export async function rescheduleReminders(
  data: ScheduleData,
  alerts: Record<string, number>,
  timeZone: string,
  quiet: { start: number; end: number },
  prefs?: DevicePrefs,
) {
  if ((await notificationPermission()) !== 'granted') return;
  const planned = planReminders(data, alerts, new Date(), timeZone, quiet, prefs);
  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const r of planned) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body, data: { block_key: r.blockKey } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
    });
  }
}

export async function cancelReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}
