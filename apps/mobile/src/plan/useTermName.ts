import { termFor } from '@dialed/schedule';
import { useApp } from '../AppProvider';
import { useClock } from '../clock/clock';

/** Today on the app's clock (dev clock in dev builds), in the Planner's time zone. */
export function usePlanToday(): string {
  const { data } = useApp();
  return useClock(data?.profile?.time_zone ?? 'America/Toronto').date;
}

/** The routine name the prototype calls `S.rName`: today's term ("Fall term"), or null without one. */
export function useTermName(): string | null {
  const { data } = useApp();
  const today = usePlanToday();
  if (!data?.schedule) return null;
  return termFor(today, data.schedule.terms ?? [])?.name ?? null;
}
