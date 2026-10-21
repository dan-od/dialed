import { localNow } from '@dialed/schedule';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

type Listener = () => void;
let devOverride: { date: string; minute: number } | null = null;
const listeners = new Set<Listener>();

/**
 * Dev-only "Set clock" for runtime proof (Flow 03 build seed). `__DEV__` is false in release builds,
 * so this can never change what a shipped app shows.
 */
export function setDevClock(v: { date: string; minute: number } | null) {
  if (!__DEV__) return;
  devOverride = v;
  listeners.forEach((l) => l());
}

// The prototype's three clock points on its sample day (Mon Oct 19, 2026), then back to the real clock.
const DEV_PRESETS = [795, 1220, 1410];
let devIndex = -1;
/** Dev-only: long-press the Day date label to cycle the preset clocks. */
export function cycleDevClock() {
  if (!__DEV__) return;
  devIndex = devIndex + 1 >= DEV_PRESETS.length ? -1 : devIndex + 1;
  setDevClock(devIndex === -1 ? null : { date: '2026-10-19', minute: DEV_PRESETS[devIndex]! });
}

export function now(timeZone: string): { date: string; minute: number } {
  if (__DEV__ && devOverride) return devOverride;
  return localNow(new Date(), timeZone);
}

/** Minute-aligned clock; pauses in the background and resyncs on foreground. */
export function useClock(timeZone: string) {
  const [value, setValue] = useState(() => now(timeZone));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      setValue(now(timeZone));
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();
    const l = () => setValue(now(timeZone));
    listeners.add(l);
    const sub = AppState.addEventListener('change', (st) => {
      if (timer) clearTimeout(timer);
      if (st === 'active') tick();
    });
    return () => {
      if (timer) clearTimeout(timer);
      listeners.delete(l);
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
