import type { DevicePrefs } from '@dialed/contracts';
import { currentActivity, localNow, type BlockActivity, type ScheduleData } from '@dialed/schedule';
import { requireOptionalNativeModule } from 'expo';

// Flow 08 step 8: the app's side of Live Activities (BACKEND_SETUP §8). The server starts and ends them by push
// on the paid account (step 7); the app starts one itself when it is in the foreground during a work block
// with none showing — the only way on the Personal Team (D-80) — and reports tokens so the server can end it.

export interface ActivityAttrsRecord {
  blockKey: string;
  title: string;
  categoryColorHex: string;
  startsAt: string;
}
export interface ActivityStateRecord {
  endsAt: string;
  next: { title: string; startsAt: string; durationMin: number }[];
}
export interface RunningActivity {
  blockKey: string;
  state: 'active' | 'ended' | 'dismissed' | 'stale' | 'unknown';
  endsAt: string;
}
type Sub = { remove(): void };

/** The Live Activity part of the `DialedNative` Expo Module (modules/dialed-native). */
export interface ActivityNative {
  activitiesEnabled(): boolean;
  runningActivities(): RunningActivity[];
  startActivity(
    attrs: ActivityAttrsRecord,
    state: ActivityStateRecord,
    localOnly: boolean,
  ): Promise<string>;
  updateActivity(blockKey: string, state: ActivityStateRecord): Promise<void>;
  endActivity(blockKey: string, dismissalDate: string | null): Promise<void>;
  endAllActivities(): Promise<void>;
  addListener(event: 'onPushToStartToken', fn: (e: { token: string }) => void): Sub;
  addListener(event: 'onActivityToken', fn: (e: { blockKey: string; token: string }) => void): Sub;
  addListener(event: 'onActivityState', fn: (e: { blockKey: string; state: string }) => void): Sub;
}

export function nativeActivities(): ActivityNative | null {
  return requireOptionalNativeModule<ActivityNative>('DialedNative');
}

/** The two device routes the client calls (step 7). */
export interface ActivityApi {
  putDevice(body: { live_activity_start_token: string | null }): Promise<unknown>;
  putActivity(
    blockKey: string,
    body: { state: 'started' | 'dismissed'; push_token?: string },
  ): Promise<unknown>;
}

export const toRecords = (
  a: BlockActivity,
): { attrs: ActivityAttrsRecord; state: ActivityStateRecord } => ({
  attrs: {
    blockKey: a.blockKey,
    title: a.title,
    categoryColorHex: a.categoryColorHex,
    startsAt: a.startsAt.toISOString(),
  },
  state: {
    endsAt: a.endsAt.toISOString(),
    next: a.next.map((n) => ({
      title: n.title,
      startsAt: n.startsAt.toISOString(),
      durationMin: n.durationMin,
    })),
  },
});

export type SyncResult =
  'unavailable' | 'off' | 'line_only' | 'started' | 'updated' | 'showing' | 'none';

type Log = (msg: string, err: unknown) => void;

export class LiveActivityClient {
  /** Blocks the Planner swiped away this session: never started again (BACKEND_SETUP §8). */
  private readonly dismissed = new Set<string>();
  /** Content last sent per block, so a re-sync only updates when the end or what's next changed. */
  private readonly sent = new Map<string, string>();
  private subs: Sub[] = [];

  constructor(
    private readonly native: ActivityNative | null,
    private readonly api: ActivityApi,
    /** Personal Team: no push, so the activity ends itself at block end (D-80); no tokens to report. */
    private readonly localOnly: boolean,
    private readonly log: Log = (m, e) => console.warn(m, e),
  ) {}

  /**
   * Bring the lock screen in line with the schedule at `now`: called on foreground and after every data or
   * prefs change. Starts the current work block's activity if none shows, updates it if its end moved, and
   * ends activities for blocks that are over, removed or turned quiet. Line only ends them all (D-07).
   */
  async sync(
    data: ScheduleData,
    prefs: Pick<DevicePrefs, 'lock_mode'>,
    timeZone: string,
    now: Date,
  ): Promise<SyncResult> {
    const n = this.native;
    if (!n) return 'unavailable';
    try {
      if (prefs.lock_mode === 'line') {
        if (n.runningActivities().some((r) => r.state === 'active' || r.state === 'stale'))
          await n.endAllActivities();
        this.sent.clear();
        return 'line_only';
      }
      if (!n.activitiesEnabled()) return 'off';
      const l = localNow(now, timeZone);
      const cur = currentActivity(data, l.date, l.minute, timeZone);
      const running = n.runningActivities();
      for (const r of running) {
        if (r.blockKey === cur?.blockKey || r.state === 'dismissed') continue;
        // Over, removed, or a back-to-back block took over: end it now (no gap: the next starts below).
        if (r.state === 'active' || r.state === 'stale') {
          await n.endActivity(r.blockKey, null);
          this.sent.delete(r.blockKey);
        }
      }
      if (!cur || this.dismissed.has(cur.blockKey)) return 'none';
      const { attrs, state } = toRecords(cur);
      const key = JSON.stringify(state);
      const mine = running.find((r) => r.blockKey === cur.blockKey);
      if (mine?.state === 'dismissed') {
        this.dismissed.add(cur.blockKey);
        return 'none';
      }
      if (!mine) {
        await n.startActivity(attrs, state, this.localOnly);
        this.sent.set(cur.blockKey, key);
        if (!this.localOnly) void this.report(cur.blockKey, { state: 'started' });
        return 'started';
      }
      // The end moved, or (this session) what's next changed: update the card in place.
      const prev = this.sent.get(cur.blockKey);
      const sameEnd = Date.parse(mine.endsAt) === cur.endsAt.getTime();
      if (!sameEnd || (prev !== undefined && prev !== key)) {
        await n.updateActivity(cur.blockKey, state);
        this.sent.set(cur.blockKey, key);
        return 'updated';
      }
      this.sent.set(cur.blockKey, key);
      return 'showing';
    } catch (e) {
      this.log('glance: live activity sync failed', e);
      return 'unavailable';
    }
  }

  /** Sign-out: end every activity now; forget this account's dismissals. */
  async endAll() {
    this.sent.clear();
    this.dismissed.clear();
    try {
      await this.native?.endAllActivities();
    } catch (e) {
      this.log('glance: ending live activities failed', e);
    }
  }

  /**
   * Token and state streams → the server: the push-to-start token goes to PUT /v1/devices/current, each
   * activity's token and a dismissal to PUT /v1/devices/current/activities/:blockKey. Call once signed in.
   */
  listen() {
    const n = this.native;
    if (!n || this.subs.length) return;
    this.subs = [
      n.addListener('onActivityState', (e) => {
        if (e.state !== 'dismissed') return;
        this.dismissed.add(e.blockKey);
        this.sent.delete(e.blockKey);
        void this.report(e.blockKey, { state: 'dismissed' });
      }),
    ];
    if (this.localOnly) return;
    this.subs.push(
      n.addListener('onPushToStartToken', (e) => {
        void this.api
          .putDevice({ live_activity_start_token: e.token })
          .catch((err) => this.log('glance: push-to-start token not sent', err));
      }),
      n.addListener(
        'onActivityToken',
        (e) => void this.report(e.blockKey, { state: 'started', push_token: e.token }),
      ),
    );
  }

  stopListening() {
    this.subs.forEach((s) => s.remove());
    this.subs = [];
  }

  private async report(
    blockKey: string,
    body: { state: 'started' | 'dismissed'; push_token?: string },
  ) {
    try {
      await this.api.putActivity(blockKey, body);
    } catch (e) {
      // Offline or the block is gone: the server's la.end falls back to staleDate (D-106).
      this.log('glance: activity report not sent', e);
    }
  }
}
