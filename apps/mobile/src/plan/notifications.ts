import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { AppState } from 'react-native';
import type { PlanApi } from './api';

type ToastFn = (msg: string) => void;

export function usePlanNotifications(planApi: PlanApi, toast: ToastFn) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { plan_id?: string } | undefined;
      if (!data?.plan_id) return;
      void navigateToPlan(data.plan_id, planApi, toast);
    });
    return () => sub.remove();
  }, [planApi, toast]);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      const id = parsePlanDeepLink(url);
      if (id) void navigateToPlan(id, planApi, toast);
    });
    return () => sub.remove();
  }, [planApi, toast]);
}

export function parsePlanDeepLink(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ?? '';
    const match = path.match(/^plan\/([0-9a-f-]{36})$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

async function navigateToPlan(id: string, planApi: PlanApi, toast: ToastFn) {
  try {
    const plan = await planApi.get(id);
    if (!plan) {
      toast('That plan isn’t available.');
      return;
    }
    router.push({ pathname: '/plan/[id]', params: { id: plan.id } });
  } catch {
    toast('That plan isn’t available.');
    router.replace('/day');
  }
}

export function usePlanReadyPolling(planApi: PlanApi) {
  const lastCheck = useRef<string | null>(null);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void checkForReadyPlans(planApi, lastCheck);
    });
    return () => sub.remove();
  }, [planApi]);
}

async function checkForReadyPlans(
  planApi: PlanApi,
  lastCheck: React.MutableRefObject<string | null>,
) {
  try {
    const { plans } = await planApi.list(5);
    for (const p of plans) {
      if ((p.status === 'ready' || p.status === 'question') && p.created_at !== lastCheck.current) {
        lastCheck.current = p.created_at;
        await Notifications.scheduleNotificationAsync({
          identifier: `plan-ready:${p.id}`,
          content: {
            title: 'Your plan is ready',
            body: p.request_text.slice(0, 100),
            data: { plan_id: p.id },
          },
          trigger: null,
        });
        break;
      }
    }
  } catch {
    // offline or no plans
  }
}
