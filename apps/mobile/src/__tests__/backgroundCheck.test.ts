import type { PlanSummary } from '@dialed/contracts';

const mockStore = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  getItemAsync: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockStore.set(k, v)),
}));
jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: jest.fn(async () => 'id') }));
const mockTasks = new Map<string, () => Promise<unknown>>();
jest.mock('expo-task-manager', () => ({
  isTaskDefined: (n: string) => mockTasks.has(n),
  defineTask: (n: string, fn: () => Promise<unknown>) => void mockTasks.set(n, fn),
  isTaskRegisteredAsync: jest.fn(async () => false),
}));
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: jest.fn(async () => 2),
  registerTaskAsync: jest.fn(async () => undefined),
}));

import * as Notifications from 'expo-notifications';
import * as BackgroundTask from 'expo-background-task';
import {
  PLAN_CHECK_TASK,
  definePlanCheckTask,
  notifyRetriedPlans,
  registerPlanCheck,
  retriedPlansToNotify,
} from '../plan/backgroundCheck';

const plan = (over: Partial<PlanSummary>): PlanSummary => ({
  id: '00000000-0000-4000-8000-000000000001',
  source: 'in_app',
  client_name: null,
  request_text: 'Bible study on Wednesdays',
  status: 'ready',
  created_at: '2037-10-20T16:00:00.000Z',
  change_count: 1,
  background_retry: 'done',
  ...over,
});
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;

beforeEach(() => {
  mockStore.clear();
  schedule.mockClear();
});

describe('retriedPlansToNotify', () => {
  it('only plans the background retry finished with a plan or a question', () => {
    const plans = [
      plan({ id: 'a' }),
      plan({ id: 'b', status: 'question' }),
      plan({ id: 'c', status: 'failed' }),
      plan({ id: 'd', background_retry: 'queued', status: 'drafting' }),
      plan({ id: 'e', background_retry: null }),
      plan({ id: 'f' }),
    ];
    expect(retriedPlansToNotify(plans, ['f']).map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('notifyRetriedPlans', () => {
  it('posts once per plan, opening the plan, and never repeats it', async () => {
    const list = async () => [plan({}), plan({ id: 'q', status: 'question' })];
    expect(await notifyRetriedPlans(list)).toBe(2);
    expect(schedule.mock.calls[0]![0]).toMatchObject({
      identifier: 'plan-ready:00000000-0000-4000-8000-000000000001',
      content: {
        title: 'Your plan is ready',
        body: 'Bible study on Wednesdays',
        data: { plan_id: '00000000-0000-4000-8000-000000000001' },
      },
      trigger: null,
    });
    expect(schedule.mock.calls[1]![0].content.title).toBe('Claude has a question about your plan');

    expect(await notifyRetriedPlans(list)).toBe(0);
    expect(schedule).toHaveBeenCalledTimes(2);
  });
});

describe('the background task', () => {
  it('checks only when a session is available', async () => {
    const list = jest.fn(async () => [plan({})]);
    let signedIn = false;
    definePlanCheckTask({ ready: async () => signedIn, list });
    const run = mockTasks.get(PLAN_CHECK_TASK)!;

    expect(await run()).toBe(1);
    expect(list).not.toHaveBeenCalled();

    signedIn = true;
    expect(await run()).toBe(1);
    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('reports a failed check to iOS', async () => {
    mockTasks.clear();
    definePlanCheckTask({
      ready: async () => true,
      list: async () => {
        throw new Error('offline');
      },
    });
    expect(await mockTasks.get(PLAN_CHECK_TASK)!()).toBe(2);
  });

  it('registers every 15 minutes at most, only when iOS allows background mockTasks', async () => {
    await registerPlanCheck();
    expect(BackgroundTask.registerTaskAsync).toHaveBeenCalledWith(PLAN_CHECK_TASK, {
      minimumInterval: 15,
    });
    (BackgroundTask.registerTaskAsync as jest.Mock).mockClear();
    (BackgroundTask.getStatusAsync as jest.Mock).mockResolvedValueOnce(1);
    await registerPlanCheck();
    expect(BackgroundTask.registerTaskAsync).not.toHaveBeenCalled();
  });
});
