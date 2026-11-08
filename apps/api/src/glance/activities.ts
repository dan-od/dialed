// Flow 08 step 7: Live Activities from the server (BACKEND_SETUP §8). One activity per work block per device:
// scheduled → started (push-to-start at block start; the phone reports its per-activity token) → ended at
// block end (push to that token, dismissal-date = end); dismissed if the Planner swiped it away (never
// restarted). Quiet blocks and Line only devices never get one (D-07). Only schedule *reads* happen here:
// no Live Activity path writes schedule data (D-06).
import { sql } from 'drizzle-orm';
import { DEFAULT_DEVICE_PREFS, type DevicePrefs } from '@dialed/contracts';
import {
  activitiesForDay,
  addDays,
  type BlockActivity,
  formatClock,
  localNow,
  type IsoDate,
} from '@dialed/schedule';
import type { Config } from '../config';
import type { Db } from '../db/pool';
import { enqueue } from '../jobs/enqueue';
import { appError } from '../lib/errors';
import { loadScheduleData } from '../plans/runner';

type Row = Record<string, unknown>;
export type Log = (obj: Record<string, unknown>) => void;

/** Give up waiting for an activity token this long after the block ends; `staleDate` then hides the card. */
export const END_GRACE_MS = 5 * 60_000;
/** Nightly re-plan at 03:00 local (a 15-minute window so a slow worker loop can't miss it). */
export const NIGHTLY_MIN = 180;
const NIGHTLY_WINDOW = 15;

/** One planned activity (the shared rule lives in @dialed/schedule, so the app starts the same one). */
export type PlannedActivity = BlockActivity;
export const planActivities = activitiesForDay;

/**
 * ActivityKit decodes `Date` with Swift's default strategy: seconds since 2001-01-01 UTC, not Unix time
 * (D-102). Every date inside `attributes` and `content-state` goes through this.
 */
export const APPLE_EPOCH_S = 978_307_200;
export const appleDate = (d: Date) => d.getTime() / 1000 - APPLE_EPOCH_S;
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

function contentState(a: Pick<PlannedActivity, 'endsAt' | 'next'>) {
  return {
    endsAt: appleDate(a.endsAt),
    next: a.next.map((n) => ({
      title: n.title,
      startsAt: appleDate(n.startsAt),
      durationMin: n.durationMin,
    })),
  };
}

export interface ApnsRequest {
  pushType: 'liveactivity';
  topic: string;
  priority: 5 | 10;
  payload: { aps: Record<string, unknown> };
}

/** Push-to-start payload (iOS 17.2+). The alert is required by iOS; it shows only on devices that light up. */
export function startRequest(
  a: PlannedActivity,
  now: Date,
  topic: string,
  endMin: number,
): ApnsRequest {
  return {
    pushType: 'liveactivity',
    topic: `${topic}.push-type.liveactivity`,
    priority: 10,
    payload: {
      aps: {
        timestamp: unix(now),
        event: 'start',
        'attributes-type': 'BlockActivityAttributes',
        attributes: {
          blockKey: a.blockKey,
          title: a.title,
          categoryColorHex: a.categoryColorHex,
          startsAt: appleDate(a.startsAt),
        },
        'content-state': contentState(a),
        'stale-date': unix(a.endsAt),
        alert: { title: a.title, body: `Until ${formatClock(endMin)}` },
      },
    },
  };
}

export function updateRequest(a: PlannedActivity, now: Date, topic: string): ApnsRequest {
  return {
    pushType: 'liveactivity',
    topic: `${topic}.push-type.liveactivity`,
    priority: 5,
    payload: {
      aps: {
        timestamp: unix(now),
        event: 'update',
        'content-state': contentState(a),
        'stale-date': unix(a.endsAt),
      },
    },
  };
}

/** End at `dismissAt` (block end; now for a block that was removed or a switch to Line only). */
export function endRequest(
  state: { endsAt: Date; next: PlannedActivity['next'] },
  now: Date,
  dismissAt: Date,
  topic: string,
): ApnsRequest {
  return {
    pushType: 'liveactivity',
    topic: `${topic}.push-type.liveactivity`,
    priority: 10,
    payload: {
      aps: {
        timestamp: unix(now),
        event: 'end',
        'content-state': contentState(state),
        'dismissal-date': unix(dismissAt),
      },
    },
  };
}

/** Sends one push. `log` mode (dev, Simulator, Personal Team) writes the payload to the log, never tokens. */
export interface PushSender {
  send(token: string, req: ApnsRequest, meta: Record<string, unknown>): Promise<void>;
}

export function pushSender(config: Config, log: Log): PushSender {
  return {
    async send(_token, req, meta) {
      if (config.APNS_MODE === 'log') {
        log({
          kind: 'apns',
          msg: 'LIVE_ACTIVITY',
          ...meta,
          topic: req.topic,
          payload: req.payload,
        });
        return;
      }
      // loadConfig refuses APNS_MODE=apns until push is activated (paid Apple account, .p8 key: stop point).
      throw new Error('APNS_MODE=apns is not activated yet');
    },
  };
}

interface Device {
  id: string;
  user_id: string;
  live_activity_start_token: string | null;
  prefs: DevicePrefs;
}

interface ActivityRow {
  id: string;
  device_id: string;
  block_key: string;
  push_token: string | null;
  state: 'scheduled' | 'started' | 'ended' | 'dismissed';
  starts_at: Date;
  ends_at: Date;
}

export class LiveActivityService {
  private readonly push: PushSender;
  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly now: () => Date,
    private readonly log: Log,
    push?: PushSender,
  ) {
    this.push = push ?? pushSender(config, log);
  }

  private async devices(userId: string, deviceId?: string): Promise<Device[]> {
    const { rows } = await this.db
      .execute<Row>(sql`select id, user_id, live_activity_start_token, prefs_json
      from devices where user_id = ${userId} and platform = 'ios'
      ${deviceId ? sql`and id = ${deviceId}` : sql``}`);
    return rows.map((r) => ({
      id: String(r.id),
      user_id: String(r.user_id),
      live_activity_start_token: (r.live_activity_start_token as string | null) ?? null,
      prefs: { ...DEFAULT_DEVICE_PREFS, ...((r.prefs_json as Partial<DevicePrefs>) ?? {}) },
    }));
  }

  private async activity(deviceId: string, blockKey: string): Promise<ActivityRow | null> {
    const { rows } = await this.db
      .execute<Row>(sql`select id, device_id, block_key, push_token, state, starts_at, ends_at
      from live_activities where device_id = ${deviceId} and block_key = ${blockKey}`);
    const r = rows[0];
    return r
      ? ({
          ...r,
          starts_at: new Date(String(r.starts_at)),
          ends_at: new Date(String(r.ends_at)),
        } as ActivityRow)
      : null;
  }

  private async timeZone(userId: string): Promise<string | null> {
    const { rows } = await this.db.execute<Row>(
      sql`select time_zone from users where id = ${userId}`,
    );
    return rows[0] ? String(rows[0].time_zone) : null;
  }

  /** Today's and tomorrow's activities that haven't ended yet. */
  private async planned(userId: string): Promise<PlannedActivity[]> {
    const tz = await this.timeZone(userId);
    if (!tz) return [];
    const data = await loadScheduleData(this.db, userId);
    const now = this.now();
    const today = localNow(now, tz).date;
    return [today, addDays(today, 1)]
      .flatMap((d) => planActivities(data, d, tz))
      .filter((a) => a.endsAt > now);
  }

  private async plannedOne(userId: string, blockKey: string): Promise<PlannedActivity | null> {
    const tz = await this.timeZone(userId);
    const date = blockKey.slice(-10) as IsoDate;
    if (!tz) return null;
    const data = await loadScheduleData(this.db, userId);
    return planActivities(data, date, tz).find((a) => a.blockKey === blockKey) ?? null;
  }

  /** Remove this device's queued start/end/update jobs (all, or one block's). */
  private async dropQueued(deviceId: string, blockKey?: string) {
    await this.db.execute(sql`delete from jobs where kind in ('la.start','la.end','la.update')
      and status in ('queued','failed') and payload_json->>'device_id' = ${deviceId}
      ${blockKey ? sql`and payload_json->>'block_key' = ${blockKey}` : sql``}`);
  }

  /**
   * `la.schedule`: (re)plan today's and tomorrow's activities for each of the user's iPhones. Idempotent: run it
   * after any schedule change, a device update and nightly. Line only → end everything (D-07).
   */
  async schedule(userId: string, deviceId?: string) {
    if (this.config.APPLE_TEAM_TIER === 'personal') {
      // No push on the Personal Team: the app starts activities itself (BACKEND_SETUP Personal Team table).
      this.log({
        kind: 'la.schedule',
        msg: 'personal tier — app starts activities locally',
        userId,
      });
      return;
    }
    const devices = await this.devices(userId, deviceId);
    if (devices.length === 0) return;
    const now = this.now();
    const planned = await this.planned(userId);
    const byKey = new Map(planned.map((a) => [a.blockKey, a]));

    for (const d of devices) {
      const { rows } = await this.db
        .execute<Row>(sql`select block_key, state, ends_at, push_token from live_activities
        where device_id = ${d.id} and state in ('scheduled','started') and ends_at > ${now.toISOString()}::timestamptz`);
      const live = d.prefs.lock_mode !== 'line';

      if (!live) {
        await this.cancel(d.id);
        continue;
      }
      // Blocks that were removed or turned quiet: drop their jobs; end the ones already showing.
      for (const r of rows) {
        const key = String(r.block_key);
        if (byKey.has(key)) continue;
        await this.dropQueued(d.id, key);
        if (r.state === 'started') await this.enqueueEnd(d.id, userId, key, now, 'removed');
        else
          await this.db.execute(
            sql`delete from live_activities where device_id = ${d.id} and block_key = ${key}`,
          );
      }

      for (const a of planned) {
        const existing = rows.find((r) => r.block_key === a.blockKey);
        await this.db
          .execute(sql`insert into live_activities (device_id, user_id, block_key, starts_at, ends_at)
          values (${d.id}, ${userId}, ${a.blockKey}, ${a.startsAt.toISOString()}::timestamptz, ${a.endsAt.toISOString()}::timestamptz)
          on conflict (device_id, block_key) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at,
            updated_at = now()
          where live_activities.state in ('scheduled','started')`);
        const row = await this.activity(d.id, a.blockKey);
        if (!row || row.state === 'dismissed' || row.state === 'ended') continue;

        // Times may have moved: replace this block's queued jobs (dedupe keys of finished jobs stay, so an
        // activity that already started is never started twice).
        await this.dropQueued(d.id, a.blockKey);
        const payload = { device_id: d.id, user_id: userId, block_key: a.blockKey };
        if (row.state === 'scheduled') {
          await enqueue(this.db, 'la.start', payload, {
            runAt: a.startsAt > now ? a.startsAt : now,
            dedupeKey: `la:${d.id}:${a.blockKey}:start`,
          });
        }
        if (
          row.state === 'started' &&
          existing &&
          new Date(String(existing.ends_at)).getTime() !== a.endsAt.getTime()
        ) {
          await enqueue(this.db, 'la.update', payload, {
            dedupeKey: `la:${d.id}:${a.blockKey}:update:${a.endsAt.getTime()}`,
          });
        }
        await enqueue(
          this.db,
          'la.end',
          { ...payload, attempt: 0 },
          {
            runAt: a.endsAt,
            dedupeKey: `la:${d.id}:${a.blockKey}:end:${a.endsAt.getTime()}`,
          },
        );
      }
    }
  }

  /** Line only (or sign-out of activities): cancel pending starts; end the activities showing now. */
  async cancel(deviceId: string) {
    const now = this.now();
    await this.dropQueued(deviceId);
    const { rows } = await this.db
      .execute<Row>(sql`select user_id, block_key, state from live_activities
      where device_id = ${deviceId} and state in ('scheduled','started')`);
    for (const r of rows) {
      if (r.state === 'started')
        await this.enqueueEnd(deviceId, String(r.user_id), String(r.block_key), now, 'line_only');
      else
        await this.db.execute(
          sql`delete from live_activities where device_id = ${deviceId} and block_key = ${String(r.block_key)}`,
        );
    }
  }

  private async enqueueEnd(
    deviceId: string,
    userId: string,
    blockKey: string,
    at: Date,
    reason: string,
  ) {
    await enqueue(
      this.db,
      'la.end',
      { device_id: deviceId, user_id: userId, block_key: blockKey, attempt: 0, now: true, reason },
      {
        runAt: at,
        dedupeKey: `la:${deviceId}:${blockKey}:end:${reason}:${at.getTime()}`,
      },
    );
  }

  /** `la.start`: push-to-start at the block's start. */
  async start(p: { device_id: string; user_id: string; block_key: string }) {
    const [d] = await this.devices(p.user_id, p.device_id);
    const row = await this.activity(p.device_id, p.block_key);
    if (!d || !row || row.state !== 'scheduled' || d.prefs.lock_mode === 'line') return;
    const a = await this.plannedOne(p.user_id, p.block_key);
    const now = this.now();
    if (!a || a.endsAt <= now) return;
    if (!d.live_activity_start_token) {
      // No push-to-start token (iOS < 17.2, or not reported yet): the app starts it when it next wakes.
      this.log({
        kind: 'la.start',
        msg: 'no push-to-start token — app starts it locally',
        deviceId: d.id,
        blockKey: a.blockKey,
      });
      return;
    }
    const tz = (await this.timeZone(p.user_id))!;
    const endMin = localNow(a.endsAt, tz).minute;
    await this.push.send(
      d.live_activity_start_token,
      startRequest(a, now, this.config.APNS_TOPIC, endMin),
      {
        job: 'la.start',
        deviceId: d.id,
        blockKey: a.blockKey,
      },
    );
  }

  /** `la.update`: the block's end moved while its activity shows. */
  async update(p: { device_id: string; user_id: string; block_key: string }) {
    const row = await this.activity(p.device_id, p.block_key);
    if (!row || row.state !== 'started' || !row.push_token) return;
    const a = await this.plannedOne(p.user_id, p.block_key);
    if (!a) return;
    await this.push.send(row.push_token, updateRequest(a, this.now(), this.config.APNS_TOPIC), {
      job: 'la.update',
      deviceId: p.device_id,
      blockKey: p.block_key,
    });
  }

  /**
   * `la.end`: end at block end (or now). Without the activity's token yet, try again each minute until
   * 5 minutes after the end; after that the activity's `staleDate` hides it.
   * Returns what happened, for tests and logs.
   */
  async end(p: {
    device_id: string;
    user_id: string;
    block_key: string;
    attempt?: number;
    now?: boolean;
    reason?: string;
  }): Promise<'sent' | 'skipped' | 'retry' | 'gave_up'> {
    const row = await this.activity(p.device_id, p.block_key);
    if (!row || row.state === 'ended' || row.state === 'dismissed') return 'skipped';
    const now = this.now();
    // A stale job: the block moved later and a newer la.end is queued.
    if (!p.now && row.ends_at.getTime() > now.getTime() + 60_000) return 'skipped';
    if (row.state === 'scheduled') {
      // Never started on this device (no token, app asleep): nothing to end.
      await this.markEnded(row.id);
      return 'skipped';
    }
    if (!row.push_token) {
      if (now.getTime() >= row.ends_at.getTime() + END_GRACE_MS) {
        await this.markEnded(row.id);
        this.log({
          kind: 'la.end',
          msg: 'no activity token — left to staleDate',
          deviceId: p.device_id,
          blockKey: p.block_key,
        });
        return 'gave_up';
      }
      const attempt = (p.attempt ?? 0) + 1;
      await enqueue(
        this.db,
        'la.end',
        { ...p, attempt },
        {
          runAt: new Date(now.getTime() + 60_000),
          dedupeKey: `la:${p.device_id}:${p.block_key}:end:retry:${row.ends_at.getTime()}:${attempt}`,
        },
      );
      return 'retry';
    }
    const a = await this.plannedOne(p.user_id, p.block_key);
    const dismissAt = p.now ? now : row.ends_at;
    await this.push.send(
      row.push_token,
      endRequest(
        { endsAt: row.ends_at, next: a?.next ?? [] },
        now,
        dismissAt,
        this.config.APNS_TOPIC,
      ),
      {
        job: 'la.end',
        deviceId: p.device_id,
        blockKey: p.block_key,
        reason: p.reason ?? 'block_end',
      },
    );
    await this.markEnded(row.id);
    return 'sent';
  }

  private async markEnded(id: string) {
    await this.db.execute(
      sql`update live_activities set state = 'ended', updated_at = now() where id = ${id}`,
    );
  }

  /** PUT /v1/devices/current/activities/:blockKey — the phone started an activity (with its token) or the Planner dismissed it. */
  async report(
    userId: string,
    deviceId: string,
    blockKey: string,
    body: { push_token?: string | null; state: 'started' | 'dismissed' },
  ) {
    const a = await this.plannedOne(userId, blockKey);
    const existing = await this.activity(deviceId, blockKey);
    if (!a && !existing) throw appError('not_found', 'That block isn’t on your schedule.');
    const starts = (a?.startsAt ?? existing!.starts_at).toISOString();
    const ends = (a?.endsAt ?? existing!.ends_at).toISOString();
    await this.db
      .execute(sql`insert into live_activities (device_id, user_id, block_key, push_token, state, starts_at, ends_at)
      values (${deviceId}, ${userId}, ${blockKey}, ${body.push_token ?? null}, ${body.state}, ${starts}::timestamptz, ${ends}::timestamptz)
      on conflict (device_id, block_key) do update set
        push_token = coalesce(excluded.push_token, live_activities.push_token),
        state = case when live_activities.state in ('ended','dismissed') then live_activities.state else excluded.state end,
        updated_at = now()`);
    // A dismissed activity is never restarted: drop its pending start.
    if (body.state === 'dismissed') {
      await this.db
        .execute(sql`delete from jobs where kind = 'la.start' and status in ('queued','failed')
        and payload_json->>'device_id' = ${deviceId} and payload_json->>'block_key' = ${blockKey}`);
    }
    const row = await this.activity(deviceId, blockKey);
    return { block_key: blockKey, state: row!.state };
  }
}

/**
 * The worker calls this every loop: users whose local time is 03:00–03:14 and who have an iPhone with Live
 * Activities on get one `la.schedule` for that night.
 */
export async function enqueueNightly(db: Db, now: Date) {
  const { rows } = await db.execute<Row>(sql`select distinct u.id, u.time_zone from users u
    join devices d on d.user_id = u.id
    where d.platform = 'ios' and coalesce(d.prefs_json->>'lock_mode', 'live') <> 'line'`);
  let queued = 0;
  for (const r of rows) {
    const l = localNow(now, String(r.time_zone));
    if (l.minute < NIGHTLY_MIN || l.minute >= NIGHTLY_MIN + NIGHTLY_WINDOW) continue;
    const id = await enqueue(
      db,
      'la.schedule',
      { user_id: String(r.id) },
      { dedupeKey: `la.nightly:${String(r.id)}:${l.date}` },
    );
    if (id) queued++;
  }
  return queued;
}
