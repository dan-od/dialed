import * as Notifications from 'expo-notifications';
import { rescheduleReminders, cancelReminders } from '../notifications/reminders';
import type { ScheduleData } from '@dialed/schedule';

jest.mock('expo-notifications');

const mockNotifications = Notifications as jest.Mocked<typeof Notifications>;

const data: ScheduleData = {
  categories: [
    {
      id: 'c1',
      name: 'Gym',
      group_name: 'Life',
      color_dark: '#000',
      color_light: '#000',
      weight: 1,
      quiet: false,
      protected: false,
      sort: 0,
      deleted_at: null,
    },
  ],
  terms: [
    {
      id: 't1',
      name: 'Fall',
      starts_on: '2037-09-14',
      ends_on: '2037-12-11',
      is_draft: false,
      deleted_at: null,
    },
  ],
  routines: [{ id: 'r1', term_id: 't1', name: 'Fall routine' }],
  routineBlocks: [
    {
      id: 'rb1',
      routine_id: 'r1',
      weekday: 3,
      start_min: 480,
      end_min: 540,
      title: 'Gym',
      category_id: 'c1',
      effective_from: '2037-09-14',
      effective_to: null,
      deleted_at: null,
    },
  ],
  overrides: [],
};

describe('rescheduleReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      status: Notifications.PermissionStatus.GRANTED,
      canAskAgain: false,
      expires: 'never',
      ios: { status: 3, allowsAlert: true, allowsBadge: false, allowsSound: true },
    } as Notifications.NotificationPermissionsStatus);
    mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    mockNotifications.cancelScheduledNotificationAsync.mockResolvedValue();
    mockNotifications.scheduleNotificationAsync.mockResolvedValue('test-id');
  });

  it('uses reminder: prefix for scheduled notification identifiers', async () => {
    await rescheduleReminders(data, {}, 'America/Toronto', { start: 1380, end: 420 });
    const calls = mockNotifications.scheduleNotificationAsync.mock.calls;
    for (const [req] of calls) {
      expect((req as { identifier?: string }).identifier).toMatch(/^reminder:/);
    }
  });

  it('only cancels notifications with the reminder: prefix', async () => {
    mockNotifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'reminder:rb1:2037-11-04', content: {}, trigger: {} } as never,
      { identifier: 'plan-ready:abc', content: {}, trigger: {} } as never,
    ]);
    await cancelReminders();
    expect(mockNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      'reminder:rb1:2037-11-04',
    );
    expect(mockNotifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith(
      'plan-ready:abc',
    );
  });
});
