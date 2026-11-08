import { formatDuration, type Minutes, type ResolvedBlock } from '@dialed/schedule';
import type { DevicePrefs } from '@dialed/contracts';

/** After this minute a finished day shows tomorrow's first block instead of "Day done" (Flow 08). */
export const TOMORROW_FROM_MIN = 22 * 60;

type Brief = { title: string; start_min: Minutes };

/** What the line under the date describes at one minute (mirrored in Swift for the inline widget, D-82). */
export type LineState =
  | { kind: 'work'; title: string; left: Minutes; next: Brief | null }
  | { kind: 'quiet'; title: string; left: Minutes; next: Brief | null }
  | { kind: 'gap'; next: Brief }
  | { kind: 'done'; tomorrow: Brief | null; lateEvening: boolean };

const brief = (b: ResolvedBlock | undefined): Brief | null =>
  b ? { title: b.title, start_min: b.start_min } : null;

/**
 * Prototype `nowNext`: the current block is the earliest active work block, else any active block; "next" is
 * the next work block that starts after now, else the next block of any kind.
 */
export function lineState(
  today: ResolvedBlock[],
  tomorrow: ResolvedBlock[],
  minute: Minutes,
): LineState {
  const active = today.filter((b) => b.start_min <= minute && minute < b.end_min);
  const cur = active.find((b) => !b.quiet) ?? active[0];
  const later = today.filter((b) => b.start_min > minute);
  const next = brief(later.find((b) => !b.quiet) ?? later[0]);
  if (cur) {
    return {
      kind: cur.quiet ? 'quiet' : 'work',
      title: cur.title,
      left: cur.end_min - minute,
      next,
    };
  }
  if (next) return { kind: 'gap', next };
  return { kind: 'done', tomorrow: brief(tomorrow[0]), lateEvening: minute >= TOMORROW_FROM_MIN };
}

/** "2:45": the line has no room for am/pm (prototype `hs`). */
export function bareClock(min: Minutes): string {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 || 12}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * The line under the date (Flow 08 text rules). Empty when the line is switched off; Line only always shows
 * it (D-07). In a work block with a Live Activity the line says what comes after, so it never repeats the card.
 */
export function lineText(s: LineState, prefs: Pick<DevicePrefs, 'lock_mode' | 'line_on'>): string {
  const live = prefs.lock_mode === 'live';
  if (live && !prefs.line_on) return '';
  switch (s.kind) {
    case 'work':
      if (live)
        return s.next
          ? `Then ${s.next.title} at ${bareClock(s.next.start_min)}`
          : 'Last block today';
      return `${s.title} · ${formatDuration(s.left)} left`;
    case 'quiet':
      return `${s.title} · ${formatDuration(s.left)} left${s.next ? `, then ${s.next.title}` : ''}`;
    case 'gap':
      return `Next: ${s.next.title} at ${bareClock(s.next.start_min)}`;
    case 'done':
      return s.lateEvening && s.tomorrow
        ? `Tomorrow: ${s.tomorrow.title} at ${bareClock(s.tomorrow.start_min)}`
        : 'Day done';
  }
}
