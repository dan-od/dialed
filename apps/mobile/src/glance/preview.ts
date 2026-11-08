import type { SnapshotV1 } from '@dialed/contracts';
import { formatCountdown, formatDuration, localNow } from '@dialed/schedule';
import { bareClock, lineAt, TOMORROW_FROM_MIN } from './lineText';

// Flow 08 step 9: what the Customize guide's previews show. The same rules as the widgets
// (targets/widgets/LockModel.swift, HomeModel.swift), from the same snapshot, so a preview reads like the
// widget the Planner will add. Text only plus simple geometry; glanceNative tests pin the shared values.

type Block = SnapshotV1['days'][0]['blocks'][number];

export interface GlancePreview {
  line: string;
  countdown: { live: boolean; progress: number; label: string; caption: 'LEFT' | 'NEXT' };
  dayRing: { segments: { start: number; end: number; past: boolean }[]; now: number; left: number };
  upNext: { kicker: string; title: string; detail: string };
  today: {
    kicker: string;
    bars: { start: number; end: number; past: boolean }[];
    now: number;
    middle: string;
  };
  week: { kicker: string; bars: number[]; todayIndex: number; detail: string } | null;
  now: { title: string; left: string; progress: number; foot: string } | null;
  next: { time: string; title: string; foot: string };
  rundown: {
    kicker: string;
    rows: { time: string; title: string; detail: string; current: boolean; color: string }[];
  };
  timeline: {
    kicker: string;
    rows: { time: string; title: string; current: boolean; past: boolean; color: string }[];
  };
}

const tenths = (x: number) => String(Math.round(x * 10) / 10);
const inText = (m: number) => (m >= 60 ? `in ${formatDuration(m)}` : `in ${m} min`);

/** null when the widgets would show a fallback ("Set up your week in Dialed", "Open Dialed to refresh"). */
export function glancePreview(
  s: SnapshotV1,
  now: Date,
  scheme: 'dark' | 'light' = 'dark',
): GlancePreview | null {
  if (s.setup_needed) return null;
  const { date, minute: c } = localNow(now, s.time_zone);
  const i = s.days.findIndex((d) => d.date === date);
  if (i < 0) return null;
  const today = s.days[i]!.blocks;
  const tomorrow = i === 0 ? s.days[1].blocks : [];
  const work = today.filter((b) => !b.quiet);
  const active = today.filter((b) => b.start_min <= c && c < b.end_min);
  const cur = active.find((b) => !b.quiet) ?? active[0];
  const later = today.filter((b) => b.start_min > c);
  const next = later.find((b) => !b.quiet) ?? later[0];
  const tFirst = tomorrow.find((b) => !b.quiet) ?? tomorrow[0];
  const color = (b: Block) => {
    const cat = s.categories[b.category_id];
    return (scheme === 'dark' ? cat?.color_dark : cat?.color_light) ?? '#8A7A70';
  };

  const a0 = Math.min(540, Math.floor(Math.min(540, ...today.map((b) => b.start_min)) / 60) * 60);
  const span = 1440 - a0;
  const frac = (m: number) => Math.min(1, Math.max(0, (m - a0) / span));
  const segments = work.map((b) => ({
    start: frac(b.start_min),
    end: frac(b.end_min),
    past: b.end_min <= c,
  }));
  const leftBlocks = work.filter((b) => b.end_min > c);
  const leftMin = leftBlocks.reduce((t, b) => t + b.end_min - Math.max(b.start_min, c), 0);
  const blocksLeft = `${leftBlocks.length} block${leftBlocks.length === 1 ? '' : 's'} left`;
  const live = !!cur && !cur.quiet;

  const weekIndex = Math.round((Date.parse(date) - Date.parse(s.week.start)) / 86_400_000);
  const h = s.week.hours_by_day;
  const mx = Math.max(...h, 0.1);
  const totalWork = work.reduce((t, b) => t + b.end_min - b.start_min, 0);
  const done =
    h.slice(0, Math.max(0, weekIndex)).reduce((t, x) => t + x, 0) + (totalWork - leftMin) / 60;
  const doneLine =
    c >= TOMORROW_FROM_MIN && tFirst
      ? `Tomorrow ${bareClock(tFirst.start_min)} · ${tFirst.title}`
      : 'Day done';

  const rest = today
    .filter((b) => b.end_min > c && (s.settings.widget_meals || !b.quiet))
    .slice(0, 4);
  const rail = today
    .filter((b) => b.end_min > c - 60 && (s.settings.widget_meals || !b.quiet))
    .slice(0, 7);
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  ];

  return {
    line: lineAt(s, now),
    countdown: live
      ? {
          live,
          progress: (c - cur!.start_min) / (cur!.end_min - cur!.start_min),
          label: formatCountdown(cur!.end_min - c),
          caption: 'LEFT',
        }
      : { live, progress: 0, label: next ? bareClock(next.start_min) : '–', caption: 'NEXT' },
    dayRing: { segments, now: frac(c), left: leftBlocks.length },
    upNext: next
      ? {
          kicker: `Next · ${inText(next.start_min - c)}`,
          title: next.title,
          detail: `${bareClock(next.start_min)}–${bareClock(next.end_min)} · ${formatDuration(next.end_min - next.start_min)}`,
        }
      : {
          kicker: 'Up next',
          title: 'Nothing else today',
          detail: tFirst
            ? `Tomorrow ${bareClock(tFirst.start_min)} · ${tFirst.title}`
            : 'Free day tomorrow',
        },
    today: {
      kicker: `Today · ${formatDuration(leftMin)} of work left`,
      bars: segments,
      now: frac(c),
      middle: blocksLeft,
    },
    week:
      weekIndex >= 0 && weekIndex <= 6
        ? {
            kicker: `Week · ${tenths(done)} / ${Math.round(s.week.planned_hours)}h`,
            bars: h.map((x) => Math.max(0.12, Math.min(1, x / mx))),
            todayIndex: weekIndex,
            detail: `Today: ${tenths(h[weekIndex]!)}h planned`,
          }
        : null,
    now: live
      ? {
          title: cur!.title,
          left: formatCountdown(cur!.end_min - c),
          progress: (c - cur!.start_min) / (cur!.end_min - cur!.start_min),
          foot: next ? `Then ${next.title}` : 'Last one today',
        }
      : null,
    next: next
      ? {
          time: bareClock(next.start_min),
          title: next.title,
          foot: `${inText(next.start_min - c)} · ${formatDuration(next.end_min - next.start_min)}`,
        }
      : { time: '–', title: 'Nothing else today', foot: 'Day done' },
    rundown: {
      kicker: `Today · ${formatDuration(leftMin)} of work left`,
      rows: rest.length
        ? rest.map((b) => ({
            time: bareClock(b.start_min),
            title: b.title,
            detail:
              b.start_min <= c
                ? `${formatCountdown(b.end_min - c)} left`
                : formatDuration(b.end_min - b.start_min),
            current: b.start_min <= c,
            color: color(b),
          }))
        : [{ time: '', title: doneLine, detail: '', current: false, color: 'transparent' }],
    },
    timeline: {
      kicker: `${weekday} ${d} · ${blocksLeft}`,
      rows: rail.map((b) => ({
        time: bareClock(b.start_min),
        title: b.title,
        current: b.start_min <= c && c < b.end_min,
        past: b.end_min <= c,
        color: color(b),
      })),
    },
  };
}
