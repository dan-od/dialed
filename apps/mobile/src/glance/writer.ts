import type { DevicePrefs } from '@dialed/contracts';
import type { ScheduleData } from '@dialed/schedule';
import { requireOptionalNativeModule } from 'expo';
import { devGlancePinned, setDevGlancePinned } from './devGlance';
import { buildSnapshot } from './snapshot';

/**
 * The part of the `DialedNative` Expo Module (modules/dialed-native, Flow 08 step 2) the snapshot needs:
 * atomic write of App Group `snapshot.json`, delete it, then `WidgetCenter.reloadAllTimelines()`.
 */
export interface GlanceNative {
  writeSnapshot(json: string): Promise<void>;
  clearSnapshot(): Promise<void>;
  reloadTimelines(): Promise<void>;
}

/** Null until the native module ships in a dev build (step 2): the writer is then a no-op. */
export function nativeGlance(): GlanceNative | null {
  return requireOptionalNativeModule<GlanceNative>('DialedNative');
}

export type WriteResult = 'written' | 'unchanged' | 'unavailable' | 'failed';

type Log = (msg: string, err: unknown) => void;

/**
 * C-x08: write the widget snapshot, then reload timelines. Skips a rewrite when nothing the widgets show has
 * changed (generated_at aside), so every local edit and sync pull can call it; `force` (app foreground)
 * always writes so the snapshot never goes stale. A failed write is logged and retried on the next call.
 */
export class SnapshotWriter {
  private last: string | null = null;

  constructor(
    private readonly native: GlanceNative | null,
    private readonly log: Log = (m, e) => console.warn(m, e),
  ) {}

  async write(
    data: ScheduleData,
    prefs: Pick<DevicePrefs, 'lock_mode' | 'line_on'>,
    timeZone: string,
    now: Date,
    opts: { force?: boolean } = {},
  ): Promise<WriteResult> {
    if (!this.native) return 'unavailable';
    if (devGlancePinned()) return 'unchanged'; // dev proof run owns the snapshot
    const snapshot = buildSnapshot(data, prefs, timeZone, now);
    const key = JSON.stringify({ ...snapshot, generated_at: null });
    if (!opts.force && key === this.last) return 'unchanged';
    try {
      await this.native.writeSnapshot(JSON.stringify(snapshot));
      this.last = key;
      await this.native.reloadTimelines();
      return 'written';
    } catch (e) {
      this.last = null;
      this.log('glance: snapshot write failed', e);
      return 'failed';
    }
  }

  /** Sign-out: widgets fall back to "Sign in to Dialed". */
  async clear(): Promise<void> {
    this.last = null;
    setDevGlancePinned(false);
    if (!this.native) return;
    try {
      await this.native.clearSnapshot();
      await this.native.reloadTimelines();
    } catch (e) {
      this.log('glance: snapshot clear failed', e);
    }
  }
}
