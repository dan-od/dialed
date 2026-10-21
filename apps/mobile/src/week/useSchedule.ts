import { useApp } from '../AppProvider';
import { useClock } from '../clock/clock';
import { useTheme } from '../theme/theme';

/** Synced schedule + the (dev-overridable) clock in the Planner's zone + theme — shared by Day/Week/Month. */
export function useSchedule() {
  const app = useApp();
  const theme = useTheme();
  const tz = app.data?.profile?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = useClock(tz);
  return { ...app, ...theme, now };
}
