import * as Notifications from 'expo-notifications';
import type { Perm } from '../blocks/form';

// Notification permission and presentation. Scheduling lives in glance/schedule.ts (Flow 08).
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
