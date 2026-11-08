import { formatDuration, localNow, type Minutes } from '@dialed/schedule';
import { SNAPSHOT_STALE_HOURS, type DevicePrefs, type SnapshotV1 } from '@dialed/contracts';

/** After this minute a finished day shows tomorrow's first block instead of "Day done" (Flow 08). */
export const TOMORROW_FROM_MIN = 22 * 60;

type Brief = { title: string; start_min: Minutes };
/** A resolved block or a snapshot block: all the line needs. */
type Span = Brief & { end_min: Minutes; quiet: boolean };

/** What the line under the date describes at one minute (mirrored in Swift for the inline widget, D-82). */
export type LineState =
  | { kind: 'work'; title: string; left: Minutes; next: Brief | null }
  | { kind: 'quiet'; title: string; left: Minutes; next: Brief | null }
  | { kind: 'gap'; next: Brief }
  | { kind: 'done'; tomorrow: Brief | null; lateEvening: boolean };

const brief = (b: Span | undefined): Brief | null =>
  b ? { title: b.title, start_min: b.start_min } : null;

/**
 * Prototype `nowNext`: the current block is the earliest active work block, else any active block; "next" is
 * the next work block that starts after now, else the next block of any kind.
 */
export function lineState(today: Span[], tomorrow: Span[], minute: Minutes): LineState {
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
  return {
    kind: 'done',
    // Like the Day hero's "Tomorrow starts at 8:10 am with…": the first work block, else the first block.
    tomorrow: brief(tomorrow.find((b) => !b.quiet) ?? tomorrow[0]),
    lateEvening: minute >= TOMORROW_FROM_MIN,
  };
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

export const LINE_SIGN_IN = 'Sign in to Dialed';
export const LINE_SET_UP = 'Set up your week in Dialed';
export const LINE_REFRESH = 'Open Dialed to refresh';

/**
 * The inline widget's text at `now` from the snapshot alone (mirrored by LineText.swift; a fixture keeps them
 * equal). After midnight it reads tomorrow from the same snapshot; past both days, or older than 26 h, it asks
 * for a refresh.
 */
export function lineAt(s: SnapshotV1 | null, now: Date): string {
  if (!s) return LINE_SIGN_IN;
  if (s.setup_needed) return LINE_SET_UP;
  if (now.getTime() - Date.parse(s.generated_at) > SNAPSHOT_STALE_HOURS * 3600_000)
    return LINE_REFRESH;
  const { date, minute } = localNow(now, s.time_zone);
  const i = s.days.findIndex((d) => d.date === date);
  if (i < 0) return LINE_REFRESH;
  const today = s.days[i]!.blocks;
  const tomorrow = i === 0 ? s.days[1].blocks : [];
  return lineText(lineState(today, tomorrow, minute), s.settings);
}
