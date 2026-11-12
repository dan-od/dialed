// Flow 06 background retry (plans/flow-06-retry.md, D-39): the server tries a plan once more after its third
// failed attempt. The free Apple account has no push, so iOS wakes Dialed now and then (expo-background-task;
// iOS picks the time) and Dialed posts a local notification when that try produced a plan.
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import type { PlanSummary } from '@dialed/contracts';
import { aiName } from '../config';

export const PLAN_CHECK_TASK = 'dialed.plan-check';
const NOTIFIED = 'dialed.plan_ready_notified';
// Plan ids only, nothing secret; readable after first unlock so a locked-phone wake can still dedupe.
const OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Plans the background retry finished with a plan or a question, not notified yet. */
export function retriedPlansToNotify(plans: PlanSummary[], notified: string[]): PlanSummary[] {
  return plans.filter(
    (p) =>
      p.background_retry === 'done' &&
      (p.status === 'ready' || p.status === 'question') &&
      !notified.includes(p.id),
  );
}

/** The local notification for a plan the background retry finished. */
export function retriedPlanNotice(p: PlanSummary): { title: string; body: string } {
  return p.status === 'question'
    ? { title: `${aiName()} has a question about your plan`, body: p.request_text.slice(0, 100) }
    : { title: 'Your plan is ready', body: p.request_text.slice(0, 100) };
}

async function readNotified(): Promise<string[]> {
  try {
    const v = await SecureStore.getItemAsync(NOTIFIED, OPTS);
    return v ? (JSON.parse(v) as string[]) : [];
  } catch {
    return [];
  }
}

/** Posts one notification per newly finished background plan; returns how many it posted. */
export async function notifyRetriedPlans(list: () => Promise<PlanSummary[]>): Promise<number> {
  const notified = await readNotified();
  const fresh = retriedPlansToNotify(await list(), notified);
  for (const p of fresh) {
    await Notifications.scheduleNotificationAsync({
      identifier: `plan-ready:${p.id}`,
      content: { ...retriedPlanNotice(p), data: { plan_id: p.id } },
      trigger: null,
    });
  }
  if (fresh.length > 0) {
    const keep = [...fresh.map((p) => p.id), ...notified].slice(0, 20);
    await SecureStore.setItemAsync(NOTIFIED, JSON.stringify(keep), OPTS);
  }
  return fresh.length;
}

export interface PlanCheckDeps {
  /** Loads the Keychain session when iOS launched Dialed in the background; false when signed out or locked. */
  ready: () => Promise<boolean>;
  list: () => Promise<PlanSummary[]>;
}

/** Must run at module load (TaskManager needs the task defined before iOS calls it). */
export function definePlanCheckTask(deps: PlanCheckDeps) {
  if (TaskManager.isTaskDefined(PLAN_CHECK_TASK)) return;
  TaskManager.defineTask(PLAN_CHECK_TASK, async () => {
    try {
      if (await deps.ready()) await notifyRetriedPlans(deps.list);
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** Asks iOS for background checks (at most every 15 minutes; iOS decides when). Signed-in only. */
export async function registerPlanCheck(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(PLAN_CHECK_TASK)) return;
    await BackgroundTask.registerTaskAsync(PLAN_CHECK_TASK, { minimumInterval: 15 });
  } catch {
    // Background App Refresh off or unsupported: the foreground check still covers it.
  }
}
