import { formatClock, formatClockShort, formatDuration, overlapOf } from '@dialed/schedule';

// Prototype v11 fit strip (`fitStrip`, L1138–1166): where the block lands in the day; a clash is just a state of
// it. Owner direction (2026-10-23): shown in Add, Edit and Move. Positions are % of the window.

export interface FitBlock {
  key?: string;
  title: string;
  start_min: number;
  end_min: number;
  quiet: boolean;
  color: string;
}
export interface FitModel {
  show: boolean;
  lo: number;
  hi: number;
  segs: {
    key: string;
    title: string;
    left: number;
    width: number;
    quiet: boolean;
    color: string;
  }[];
  me: { left: number; width: number; label: string; bad: boolean };
  hatch: { left: number; width: number } | null;
  head:
    | { kind: 'free'; text: string }
    | { kind: 'clash'; title: string; minutes: number }
    | { kind: 'sharing'; title: string };
  slot: { start: number; left: number; width: number; label: string } | null;
  ticks: { m: number; label: string; left: number }[];
  caption: string | null;
  a11y: string;
}

const work = (b: FitBlock) => !b.quiet;

/** The next start of the same length that clashes with no work block, looking later in the day (prototype). */
export function nextFree(
  day: FitBlock[],
  start: number,
  end: number,
  ignoreKey?: string,
): number | null {
  const len = end - start;
  const list = day.filter((b) => work(b) && b.key !== ignoreKey);
  let c = start;
  for (let i = 0; i < 30; i++) {
    const hit = list.find((b) => b.start_min < c + len && c < b.end_min);
    if (!hit) break;
    c = hit.end_min;
  }
  return c + len <= 1440 ? c : null;
}

export function fitModel(o: {
  day: FitBlock[];
  start: number;
  end: number;
  title: string;
  keep: boolean;
  ignoreKey?: string;
}): FitModel {
  const list = o.day
    .filter((b) => b.key === undefined || b.key !== o.ignoreKey)
    .sort((a, b) => a.start_min - b.start_min);
  const len = o.end - o.start;
  const ov = len > 0 ? overlapOf(list, o.start, o.end) : null;
  const slot = ov ? nextFree(list, o.start, o.end) : null;
  let lo = o.start - 60;
  let hi = o.end + 60;
  if (ov) {
    lo = Math.min(lo, ov.start_min - 30);
    hi = Math.max(hi, ov.end_min + 30);
  }
  if (slot !== null) hi = Math.max(hi, slot + len + 30);
  lo = Math.max(0, Math.floor(lo / 60) * 60);
  hi = Math.min(1440, Math.ceil(hi / 60) * 60);
  const span = Math.max(1, hi - lo);
  const L = (m: number) => ((Math.max(m, lo) - lo) / span) * 100;
  const W = (a: number, b: number) => ((Math.min(b, hi) - Math.max(a, lo)) / span) * 100;

  const segs = list
    .filter((b) => b.end_min > lo && b.start_min < hi)
    .map((b) => ({
      key: b.key ?? `${b.title}-${b.start_min}`,
      title: b.title,
      left: L(b.start_min),
      width: W(b.start_min, b.end_min),
      quiet: b.quiet,
      color: b.color,
    }));
  const bad = !!ov && !o.keep;
  const me = {
    left: L(o.start),
    width: W(o.start, o.end),
    label: o.title.trim() || 'New block',
    bad,
  };

  let hatch: FitModel['hatch'] = null;
  let head: FitModel['head'];
  if (ov) {
    const os = Math.max(o.start, ov.start_min);
    const oe = Math.min(o.end, ov.end_min);
    if (!o.keep) hatch = { left: L(os), width: W(os, oe) };
    head = o.keep
      ? { kind: 'sharing', title: ov.title }
      : { kind: 'clash', title: ov.title, minutes: oe - os };
  } else {
    const prev = list.filter((b) => b.end_min <= o.start).pop();
    const next = list.find((b) => b.start_min >= o.end);
    head = {
      kind: 'free',
      text: `Free ${formatClock(prev ? prev.end_min : 0)} to ${formatClock(next ? next.start_min : 1440)}`,
    };
  }
  const ghost =
    ov && slot !== null && !o.keep
      ? { start: slot, left: L(slot), width: W(slot, slot + len), label: formatClock(slot) }
      : null;
  const step = span > 360 ? 120 : 60;
  const ticks: FitModel['ticks'] = [];
  for (let m = lo; m <= hi; m += step)
    ticks.push({ m, label: formatClockShort(m % 1440), left: L(m) });
  return {
    show: len > 0,
    lo,
    hi,
    segs,
    me,
    hatch,
    head,
    slot: ghost,
    ticks,
    caption: ghost ? `Dashed: the next free ${formatDuration(len)}. Tap it to move there.` : null,
    a11y: `${ov ? `Overlaps ${ov.title}` : 'Fits'}, ${formatClock(o.start)} to ${formatClock(o.end)}`,
  };
}
