import * as Notifications from 'expo-notifications';
import { DEFAULT_DEVICE_PREFS } from '@dialed/contracts';
import { planReminders } from '../glance/plan';
import {
  handleReminderResponse,
  registerNotificationCategories,
  scheduleNotifications,
  SNOOZE_MIN,
} from '../glance/schedule';

jest.mock('expo-notifications');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { seedData } = require('../../../../packages/schedule/test/seed');

const data = seedData();
const TZ = 'America/Toronto';
const QUIET = { start: 0, end: 540 }; // 12 am–9 am (Flow 08 default)
// Monday 2037-10-19, 12:01 am Toronto: the whole Monday and Tuesday are ahead.
const now = new Date('2037-10-19T04:01:00.000Z');
const prefs = { ...DEFAULT_DEVICE_PREFS, heads_up_min: 10 as const, meal_notes: true };
const mocked = Notifications as jest.Mocked<typeof Notifications>;

const perDay = (r: { at: Date }[]) => {
  const m = new Map<string, number>();
  for (const x of r) {
    const d = x.at.toLocaleDateString('en-CA', { timeZone: TZ });
    m.set(d, (m.get(d) ?? 0) + 1);
  }
  return m;
};

describe('planReminders (glance): heads-ups, meal notes, cap, quiet hours', () => {
  it('heads-ups are BLOCK_REMINDER, meal notes are MEAL_NOTE at the quiet block start', () => {
    const r = planReminders(data, {}, now, TZ, QUIET, { ...prefs, daily_cap: 20 });
    const net = r.find((x) => x.title.startsWith('Advanced Networking I'))!;
    expect(net).toMatchObject({ kind: 'heads_up', category: 'BLOCK_REMINDER' });
    expect(net.title).toBe('Advanced Networking I in 10 min');
    expect(net.at.toISOString()).toBe('2037-10-19T13:30:00.000Z'); // 9:30 am EDT
    const lunch = r.find((x) => x.title.startsWith('Lunch'))!;
    expect(lunch).toMatchObject({ kind: 'meal', category: 'MEAL_NOTE', title: 'Lunch starts now' });
    expect(lunch.at.toISOString()).toBe('2037-10-19T16:00:00.000Z'); // 12:00 pm EDT
  });

  it('daily cap 6: oldest first, the rest dropped', () => {
    const r = planReminders(data, {}, now, TZ, QUIET, prefs);
    for (const n of perDay(r).values()) expect(n).toBeLessThanOrEqual(6);
    const mon = r.filter((x) => x.blockKey.endsWith(':2037-10-19'));
    expect(mon.map((x) => x.title)[0]).toBe('Breakfast starts now');
    expect(mon).toHaveLength(6);
  });

  it('quiet hours 12 am–9 am: nothing scheduled inside them', () => {
    const r = planReminders(data, {}, now, TZ, QUIET, { ...prefs, daily_cap: 20 });
    // Tuesday's Breakfast (7:30) and the 8:00 heads-up for the 8:10 lecture fall in quiet hours.
    expect(
      r.find((x) => x.blockKey.endsWith(':2037-10-20') && x.title.startsWith('Breakfast')),
    ).toBeUndefined();
    expect(r.find((x) => x.title === 'Cryptography lecture in 10 min')).toBeUndefined();
    for (const x of r) {
      const h = Number(
        x.at.toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }),
      );
      expect(h).toBeGreaterThanOrEqual(9);
    }
  });

  it('meal notes off: no MEAL_NOTE; heads-up off: no BLOCK_REMINDER', () => {
    const noMeals = planReminders(data, {}, now, TZ, QUIET, {
      ...prefs,
      meal_notes: false,
      daily_cap: 20,
    });
    expect(noMeals.some((x) => x.category === 'MEAL_NOTE')).toBe(false);
    const noHeads = planReminders(data, {}, now, TZ, QUIET, {
      ...prefs,
      heads_up_min: null,
      daily_cap: 20,
    });
    expect(noHeads.some((x) => x.kind === 'heads_up')).toBe(false);
  });
});

describe('scheduleNotifications (expo-notifications)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.getPermissionsAsync.mockResolvedValue({
      granted: true,
      status: Notifications.PermissionStatus.GRANTED,
      canAskAgain: false,
      expires: 'never',
    } as Notifications.NotificationPermissionsStatus);
    mocked.getAllScheduledNotificationsAsync.mockResolvedValue([]);
    mocked.cancelScheduledNotificationAsync.mockResolvedValue();
    mocked.scheduleNotificationAsync.mockResolvedValue('id');
    mocked.setNotificationCategoryAsync.mockResolvedValue({} as never);
  });

  it('registers BLOCK_REMINDER (Snooze 10 min | Open day) and passive MEAL_NOTE', async () => {
    await registerNotificationCategories();
    const calls = mocked.setNotificationCategoryAsync.mock.calls;
    const block = calls.find(([id]) => id === 'BLOCK_REMINDER')!;
    expect(block[1].map((a) => [a.identifier, a.buttonTitle])).toEqual([
      ['SNOOZE_10', 'Snooze 10 min'],
      ['OPEN_DAY', 'Open day'],
    ]);
    expect(block[1][1]!.options?.opensAppToForeground).toBe(true);
    expect(calls.find(([id]) => id === 'MEAL_NOTE')![1]).toEqual([]);
  });

  it('meal notes are passive and silent; heads-ups carry the category and block key', async () => {
    await scheduleNotifications(data, {}, TZ, QUIET, { ...prefs, daily_cap: 20 }, now);
    const reqs = mocked.scheduleNotificationAsync.mock.calls.map(([r]) => r);
    const meal = reqs.find((r) => r.content.categoryIdentifier === 'MEAL_NOTE')!;
    expect(meal.content).toMatchObject({ interruptionLevel: 'passive', sound: false });
    const head = reqs.find((r) => r.content.categoryIdentifier === 'BLOCK_REMINDER')!;
    expect(head.identifier).toMatch(/^reminder:/);
    expect((head.content.data as { block_key: string }).block_key).toMatch(
      /:2037-10-1[89]|:2037-10-2/,
    );
  });

  it('does nothing without notification permission', async () => {
    mocked.getPermissionsAsync.mockResolvedValue({
      granted: false,
      status: Notifications.PermissionStatus.DENIED,
      canAskAgain: false,
      expires: 'never',
    } as Notifications.NotificationPermissionsStatus);
    await scheduleNotifications(data, {}, TZ, QUIET, prefs, now);
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('reminder actions', () => {
  const response = (actionIdentifier: string) =>
    ({
      actionIdentifier,
      notification: {
        request: {
          identifier: 'reminder:rb1:2037-10-19',
          content: {
            title: 'Gym in 10 min',
            body: 'Starts at 4:15 pm.',
            categoryIdentifier: 'BLOCK_REMINDER',
            data: { block_key: 'rb1:2037-10-19' },
          },
        },
      },
    }) as unknown as Notifications.NotificationResponse;

  beforeEach(() => {
    jest.clearAllMocks();
    mocked.scheduleNotificationAsync.mockResolvedValue('id');
  });

  it('Snooze 10 min reschedules the same note 10 minutes from now', async () => {
    const at = new Date('2037-10-19T20:05:00.000Z');
    expect(await handleReminderResponse(response('SNOOZE_10'), at)).toBe('snoozed');
    const [req] = mocked.scheduleNotificationAsync.mock.calls[0]!;
    expect(req.identifier).toBe('reminder:rb1:2037-10-19:snooze');
    expect(req.content).toMatchObject({
      title: 'Gym in 10 min',
      categoryIdentifier: 'BLOCK_REMINDER',
    });
    expect((req.trigger as { date: Date }).date.getTime()).toBe(at.getTime() + SNOOZE_MIN * 60_000);
  });

  it('Open day and a plain tap open Day; other notifications are left alone', async () => {
    expect(await handleReminderResponse(response('OPEN_DAY'))).toBe('open_day');
    expect(await handleReminderResponse(response(Notifications.DEFAULT_ACTION_IDENTIFIER))).toBe(
      'open_day',
    );
    const plan = {
      actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER,
      notification: {
        request: { identifier: 'plan-ready:x', content: { data: { plan_id: 'x' } } },
      },
    } as unknown as Notifications.NotificationResponse;
    expect(await handleReminderResponse(plan)).toBeNull();
    expect(mocked.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
