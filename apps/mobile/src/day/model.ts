import {
  formatClock,
  formatClockShort,
  formatCountdown,
  formatDuration,
  nowState,
  percentOfDayGone,
  restOfToday,
  spokenDuration,
  type ResolvedBlock,
} from '@dialed/schedule';

export interface BarModel {
  key: string;
  flex: number;
  heightPct: number;
  tone: 'current' | 'past' | 'future';
  color: string;
}

export interface RowModel {
  key: string;
  time: string;
  title: string;
  duration: string;
  quiet: boolean;
  pending: boolean;
  /** Just added or changed: "New" chip + flash (Flow 04). */
  isNew: boolean;
  a11y: string;
}

export interface DayModel {
  label: 'Right now' | 'Up next' | 'All done' | 'Free day';
  title: string;
  titleSize: number;
  countdown: string | null;
  sub: string;
  bars: BarModel[];
  axis: { start: string; mid: string; end: string };
  rows: RowModel[];
  restLabel: string;
  heroA11y: string;
}

/** Prototype hero title size: ≤100, ≤ width/(longest word × .5), 64 for long titles; auto-fit shrinks further. */
export function heroTitleSize(title: string, width: number): number {
  const longest = Math.max(...title.split(' ').map((w) => w.length));
  return Math.min(100, Math.floor(width / (longest * 0.5)), title.length > 16 ? 64 : 100);
}

export function tomorrowLine(tomorrow: ResolvedBlock[]): string {
  const first = tomorrow.find((b) => !b.quiet);
  if (!first) return 'Nothing planned tomorrow yet.';
  return `Tomorrow starts at ${formatClock(first.start_min)} with your ${first.title}.`;
}

export function dayModel(opts: {
  blocks: ResolvedBlock[];
  tomorrow: ResolvedBlock[];
  minute: number;
  dayStart: number;
  dayEnd: number;
  width: number;
  isLight: boolean;
  colors: { acc: string; barPast: string; barFut: string };
  pendingIds?: Set<string>;
  highlight?: string | null;
}): DayModel {
  const { blocks, minute, dayStart, dayEnd } = opts;
  const s = nowState(blocks, minute);
  let label: DayModel['label'];
  let title: string;
  let countdown: string | null = null;
  let sub: string;
  let heroA11y: string;
  const five = (m: number) => Math.max(5, Math.floor(m / 5) * 5); // VoiceOver updates every 5 minutes, not every minute
  switch (s.kind) {
    case 'in':
      label = 'Right now';
      title = s.block.title;
      countdown = formatCountdown(s.remaining);
      sub = `left, ends ${formatClock(s.block.end_min)}`;
      heroA11y = `Right now: ${title}, ${spokenDuration(five(s.remaining))} left, ends ${formatClock(s.block.end_min)}`;
      break;
    case 'next':
      label = 'Up next';
      title = s.block.title;
      countdown = formatCountdown(s.untilStart);
      sub = `until it starts at ${formatClock(s.block.start_min)}`;
      heroA11y = `Up next: ${title}, starts at ${formatClock(s.block.start_min)}, in ${spokenDuration(five(s.untilStart))}`;
      break;
    case 'done':
      label = 'All done';
      title = 'Day done';
      sub = tomorrowLine(opts.tomorrow);
      heroA11y = `All done. ${sub}`;
      break;
    case 'free':
      label = 'Free day';
      title = 'Free day';
      sub = 'Nothing planned. Add something or ask Claude.';
      heroA11y = `Free day. ${sub}`;
      break;
  }
  const current = s.kind === 'in' ? s.block : null;
  const bars = blocks
    .filter((b) => b.start_min >= dayStart)
    .map((b): BarModel => {
      const tone = b === current ? 'current' : b.end_min <= minute ? 'past' : 'future';
      return {
        key: b.key,
        flex: b.end_min - b.start_min,
        heightPct: Math.round((b.category?.weight ?? 0.7) * 100),
        tone,
        color:
          tone === 'current'
            ? opts.colors.acc
            : tone === 'past'
              ? opts.colors.barPast
              : opts.colors.barFut,
      };
    });
  const rest = restOfToday(blocks, minute);
  const rows = rest.map((b): RowModel => {
    const time = formatClock(b.start_min).replace(/ (am|pm)$/, '');
    return {
      key: b.key,
      time,
      title: b.title,
      duration: formatDuration(b.end_min - b.start_min),
      quiet: b.quiet,
      pending: [b.override_id, b.routine_block_id].some((id) => !!id && opts.pendingIds?.has(id)),
      isNew: b.key === opts.highlight,
      a11y: `Edit ${b.title}, ${formatClock(b.start_min)}${b.key === opts.highlight ? ', new' : ''}`,
    };
  });
  return {
    label,
    title,
    titleSize: heroTitleSize(title, opts.width - 40),
    countdown,
    sub,
    bars,
    axis: {
      start: formatClockShort(dayStart),
      mid: `${percentOfDayGone(minute, dayStart, dayEnd)}% of the day gone`,
      end: formatClockShort(dayEnd),
    },
    rows,
    restLabel: `${rows.length} ${rows.length === 1 ? 'block' : 'blocks'}`,
    heroA11y,
  };
}
