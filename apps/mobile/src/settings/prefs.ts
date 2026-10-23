import { DEFAULT_DEVICE_PREFS, type DevicePrefs } from '@dialed/contracts';
import type { LocalStore } from '../data/types';

const KEY = 'device_prefs';
const DIRTY = 'device_prefs_dirty';

/**
 * This phone's notification prefs (Flow 09): kept in the local store so they apply at once and offline, then
 * sent with PUT /v1/devices/current (not a sync mutation: they belong to this phone). Last write wins.
 */
export class DevicePrefsStore {
  constructor(
    private readonly store: LocalStore,
    private readonly put: (p: DevicePrefs) => Promise<DevicePrefs>,
  ) {}

  async get(): Promise<DevicePrefs> {
    const raw = await this.store.getMeta(KEY);
    return { ...DEFAULT_DEVICE_PREFS, ...(raw ? (JSON.parse(raw) as Partial<DevicePrefs>) : {}) };
  }

  async set(change: Partial<DevicePrefs>): Promise<DevicePrefs> {
    const next = { ...(await this.get()), ...change };
    if (next.lock_mode === 'line') next.line_on = true; // Line only keeps the line (D-07)
    await this.store.setMeta(KEY, JSON.stringify(next));
    await this.store.setMeta(DIRTY, '1');
    return next;
  }

  /** Send a waiting change; stays waiting when offline. */
  async flush(): Promise<void> {
    if ((await this.store.getMeta(DIRTY)) !== '1') return;
    try {
      await this.put(await this.get());
      await this.store.setMeta(DIRTY, '0');
    } catch {
      /* next foreground or reconnect */
    }
  }

  /** The server's copy (after sign-in on a phone that had prefs); a waiting local change wins. */
  async adopt(server: DevicePrefs): Promise<void> {
    if ((await this.store.getMeta(DIRTY)) === '1') return;
    await this.store.setMeta(KEY, JSON.stringify({ ...DEFAULT_DEVICE_PREFS, ...server }));
  }
}
