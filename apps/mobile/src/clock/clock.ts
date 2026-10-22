import { localNow } from '@dialed/schedule';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

type Listener = () => void;
/** Dev clock: a wall-clock time on a date that keeps ticking from the moment it was set. */
let devOverride: { date: string; ms: number; setAt: number } | null = null;
const listeners = new Set<Listener>();

/**
 * Dev-only "Set clock" for runtime proof (Flow 03 build seed). `__DEV__` is false in release builds,
 * so this can never change what a shipped app shows.
 */
export function setDevClock(v: { date: string; minute: number; second?: number } | null) {
  if (!__DEV__) return;
  devOverride = v
    ? { date: v.date, ms: (v.minute * 60 + (v.second ?? 0)) * 1000, setAt: Date.now() }
    : null;
  listeners.forEach((l) => l());
}

// The prototype's three clock points on its sample day (Mon Oct 19, 2026), 15 s before Sermon Sync ends
// (minute-boundary proof), then 1:15 pm on the real date (Flow 04: the server only takes "every week"
// changes from today on), then back to the real clock.
const DEV_PRESETS: { minute: number; second?: number; realDate?: boolean }[] = [
  { minute: 795 },
  { minute: 1220 },
  { minute: 1410 },
  { minute: 869, second: 45 },
  { minute: 795, realDate: true },
];
const deviceToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let devIndex = -1;
/** Dev-only: long-press the Day date label to cycle the preset clocks. */
export function cycleDevClock() {
  if (!__DEV__) return;
  devIndex = devIndex + 1 >= DEV_PRESETS.length ? -1 : devIndex + 1;
  const p = DEV_PRESETS[devIndex];
  setDevClock(p ? { date: p.realDate ? deviceToday() : '2026-10-19', ...p } : null);
}

function devMs(): number | null {
  if (!__DEV__ || !devOverride) return null;
  return Math.min(devOverride.ms + (Date.now() - devOverride.setAt), 24 * 3_600_000 - 1);
}

export function now(timeZone: string): { date: string; minute: number } {
  const ms = devMs();
  if (ms !== null) return { date: devOverride!.date, minute: Math.floor(ms / 60_000) };
  return localNow(new Date(), timeZone);
}

/** Milliseconds until the clock's next minute (real or dev). */
function untilNextMinute(): number {
  const ms = devMs() ?? Date.now();
  return 60_000 - (ms % 60_000);
}

/** Minute-aligned clock; pauses in the background and resyncs on foreground. */
export function useClock(timeZone: string) {
  const [value, setValue] = useState(() => now(timeZone));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      setValue((prev) => {
        const next = now(timeZone);
        return prev.date === next.date && prev.minute === next.minute ? prev : next;
      });
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, untilNextMinute() + 50);
    };
    tick();
    listeners.add(tick);
    const sub = AppState.addEventListener('change', (st) => {
      if (timer) clearTimeout(timer);
      if (st === 'active') tick();
    });
    return () => {
      if (timer) clearTimeout(timer);
      listeners.delete(tick);
      sub.remove();
    };
  }, [timeZone]);
  return value;
}

/** "Mon 19 Oct" */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()];
  const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    m - 1
  ];
  return `${wd} ${d} ${mo}`;
}
