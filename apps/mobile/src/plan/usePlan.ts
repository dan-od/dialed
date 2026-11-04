import type { PlanDTO, PlanStatus } from '@dialed/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { PlanApi } from './api';

const TERMINAL: Set<PlanStatus> = new Set(['approved', 'discarded', 'cancelled']);
const FAST_MS = 1_000;
const SLOW_MS = 3_000;
const SLOW_AFTER_MS = 90_000;

export function usePlan(api: PlanApi, id: string | null) {
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef(0);

  const fetchPlan = useCallback(async () => {
    if (!id) return;
    try {
      const p = await api.get(id);
      setPlan(p);
      setError(null);
      return p;
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Unknown'));
      return null;
    }
  }, [api, id]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = await fetchPlan();
    setLoading(false);
    return p;
  }, [fetchPlan]);

  useEffect(() => {
    if (!id) {
      setPlan(null);
      return;
    }
    start.current = Date.now();
    void load();
    return () => clearTimeout(timer.current);
  }, [id, load]);

  useEffect(() => {
    if (!id || !plan) return;
    if (TERMINAL.has(plan.status)) return;
    if (plan.status !== 'drafting') return;

    const poll = () => {
      const elapsed = Date.now() - start.current;
      const delay = elapsed > SLOW_AFTER_MS ? SLOW_MS : FAST_MS;
      timer.current = setTimeout(async () => {
        const p = await fetchPlan();
        if (p && !TERMINAL.has(p.status) && p.status === 'drafting') poll();
      }, delay);
    };
    poll();
    return () => clearTimeout(timer.current);
  }, [id, plan, fetchPlan]);

  // Resume polling when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && id && plan && !TERMINAL.has(plan.status)) {
        void fetchPlan();
      }
    });
    return () => sub.remove();
  }, [id, plan, fetchPlan]);

  const refresh = useCallback(async () => {
    return fetchPlan();
  }, [fetchPlan]);

  return { plan, loading, error, refresh, setPlan };
}
