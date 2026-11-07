import { useRouter } from 'expo-router';
import { useTheme } from '../theme/theme';
import {
  pickTimetableFrom,
  showTimetableSourceSheet,
  type TimetablePickResult,
  type TimetableSource,
} from './pickTimetable';

/**
 * Starts a timetable read: the source sheet (or one source directly, for Retake), then Reading.
 * `replace` swaps the current page (Found / No classes found) instead of stacking a new one.
 */
export function useTimetableStart(onCameraDenied: () => void) {
  const router = useRouter();
  const { isLight } = useTheme();
  return async (opts?: { source?: TimetableSource; replace?: boolean }) => {
    const result: TimetablePickResult = opts?.source
      ? await pickTimetableFrom(opts.source)
      : await showTimetableSourceSheet(isLight);
    if (result.kind === 'camera_denied') {
      onCameraDenied();
      return;
    }
    if (result.kind === 'cancelled') return;
    const href = {
      pathname: '/import/reading' as const,
      params: {
        uri: result.file.uri,
        name: result.file.name,
        mime: result.file.mimeType,
        source: result.source,
      },
    };
    if (opts?.replace) router.replace(href);
    else router.push(href);
  };
}
