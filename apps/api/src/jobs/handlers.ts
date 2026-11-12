import { sql } from 'drizzle-orm';
import { localNow } from '@dialed/schedule';
import type { Db } from '../db/pool';
import type { Config } from '../config';
import { PlanService, MAX_REDOS } from '../plans/service';
import { startPlanRun, initRunner } from '../plans/runner';
import { LiveActivityService, type PushSender } from '../glance/activities';
import { enqueue } from './enqueue';

type Row = Record<string, unknown>;

export interface HandlerDeps {
  db: Db;
  config: Config;
  now: () => Date;
  log: (obj: Record<string, unknown>) => void;
  /** Tests capture pushes here; defaults to the APNS_MODE sender. */
  push?: PushSender;
}

type LaPayload = { device_id: string; user_id: string; block_key: string };

export function createHandlers(deps: HandlerDeps) {
  const { db, config, now, log } = deps;
  const planService = new PlanService(db, config, now);
  const activities = new LiveActivityService(db, config, now, log, deps.push);

  return {
    // Flow 08 Live Activities (src/glance/activities.ts).
    'la.schedule': async (payload: unknown) => {
      const p = payload as { user_id: string; device_id?: string };
      await activities.schedule(p.user_id, p.device_id);
    },
    'la.start': async (payload: unknown) => activities.start(payload as LaPayload),
    'la.update': async (payload: unknown) => activities.update(payload as LaPayload),
    'la.end': async (payload: unknown) => {
      await activities.end(
        payload as LaPayload & { attempt?: number; now?: boolean; reason?: string },
      );
    },

    // Flow 06: the one background try after the third failed attempt (queued by queueBackgroundRetry).
    'plan.retry': async (payload: unknown) => {
      const p = payload as { plan_id: string; user_id: string };

      const {
        rows: [plan],
      } = await db.execute<Row>(
        sql`select p.status, p.attempts, p.provider_mode, p.provider, p.request_text, p.bg_retry_at,
          u.time_zone
          from plans p join users u on u.id = p.user_id
          where p.id = ${p.plan_id} and p.user_id = ${p.user_id}`,
      );
      // The Planner may have edited, cancelled or approved since; then there's nothing to retry.
      if (!plan || String(plan.status) !== 'failed' || !plan.bg_retry_at) return;
      if (Number(plan.attempts) < MAX_REDOS) return;
      // Own keys are never stored (D-13), so an own-key plan can't be retried here.
      if (String(plan.provider_mode ?? 'server') !== 'server') return;
      if (config.AI_MODE !== 'fixture' && !config.ANTHROPIC_API_KEY) {
        log({ kind: 'plan.retry', msg: 'no server key configured, skipping', planId: p.plan_id });
        return;
      }

      // Status moves to drafting only if nothing else touched the plan in the meantime.
      const { rows: claimed } = await db.execute<Row>(
        sql`update plans set status = 'drafting', error_code = null, validation_errors_json = null
          where id = ${p.plan_id} and status = 'failed' returning id`,
      );
      if (claimed.length === 0) return;
      log({ kind: 'plan.retry', msg: 'background retry started', planId: p.plan_id });
      initRunner(config);

      try {
        await startPlanRun({
          db,
          config,
          planService,
          planId: p.plan_id,
          userId: p.user_id,
          requestText: String(plan.request_text),
          timeZone: String(plan.time_zone),
          now,
          providerMode: 'server',
          provider: plan.provider ? String(plan.provider) : undefined,
          log,
        });
      } catch {
        // startPlanRun stores the failure itself
      }

      const {
        rows: [after],
      } = await db.execute<Row>(sql`select status from plans where id = ${p.plan_id}`);
      log({
        kind: 'plan.retry',
        msg: 'background retry finished',
        planId: p.plan_id,
        status: after?.status,
      });
      if (String(after?.status) === 'ready' || String(after?.status) === 'question') {
        await enqueue(
          db,
          'push.plan_ready',
          { plan_id: p.plan_id, user_id: p.user_id },
          {
            dedupeKey: `push:${p.plan_id}`,
          },
        );
      }
    },

    'push.plan_ready': async (payload: unknown) => {
      const p = payload as { plan_id: string; user_id: string };

      if (config.APPLE_TEAM_TIER === 'personal') {
        log({ kind: 'push.plan_ready', msg: 'personal tier — push skipped', planId: p.plan_id });
        return;
      }

      const {
        rows: [user],
      } = await db.execute<Row>(
        sql`select time_zone, quiet_start_min, quiet_end_min from users where id = ${p.user_id}`,
      );
      if (!user) return;

      const tz = String(user.time_zone);
      const quietStart = Number(user.quiet_start_min);
      const quietEnd = Number(user.quiet_end_min);
      const { minute } = localNow(now(), tz);

      if (isInQuietHours(minute, quietStart, quietEnd)) {
        const deferMinutes = minutesUntilQuietEnd(minute, quietEnd);
        const deferAt = new Date(now().getTime() + deferMinutes * 60_000);
        await enqueue(
          db,
          'push.plan_ready',
          { plan_id: p.plan_id, user_id: p.user_id },
          {
            runAt: deferAt,
            dedupeKey: `push:${p.plan_id}:deferred`,
          },
        );
        log({
          kind: 'push.plan_ready',
          msg: 'deferred to quiet-hours end',
          planId: p.plan_id,
          deferMinutes,
        });
        return;
      }

      const { rows: devices } = await db.execute<Row>(
        sql`select id, apns_token from devices where user_id = ${p.user_id} and apns_token is not null`,
      );
      if (devices.length === 0) return;

      if (config.APNS_MODE === 'log') {
        for (const d of devices) {
          log({
            kind: 'push.plan_ready',
            msg: 'PLAN_READY',
            planId: p.plan_id,
            deviceId: String(d.id),
            url: `dialed://plan/${p.plan_id}`,
          });
        }
        return;
      }
      // APNS_MODE=apns: real push not activated yet (see config guard)
    },

    'uploads.sweep': async (_payload: unknown) => {
      const { readdir, stat: fsStat, unlink } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const uploadDir = config.UPLOAD_DIR ?? '/tmp/dialed-uploads';
      try {
        const files = await readdir(uploadDir);
        const oneHourAgo = Date.now() - 60 * 60 * 1000;
        let deleted = 0;
        for (const f of files) {
          const fp = join(uploadDir, f);
          const s = await fsStat(fp);
          if (s.mtimeMs < oneHourAgo) {
            await unlink(fp);
            deleted++;
          }
        }
        if (deleted > 0) log({ kind: 'uploads.sweep', msg: `deleted ${deleted} orphaned files` });
      } catch {
        // upload dir may not exist
      }
    },

    'push.chat_draft': async (payload: unknown) => {
      const p = payload as {
        plan_id: string;
        user_id: string;
        client_name: string;
        change_count: number;
        term_name: string;
      };

      if (config.APPLE_TEAM_TIER === 'personal') {
        log({ kind: 'push.chat_draft', msg: 'personal tier — push skipped', planId: p.plan_id });
        return;
      }

      const {
        rows: [user],
      } = await db.execute<Row>(
        sql`select time_zone, quiet_start_min, quiet_end_min from users where id = ${p.user_id}`,
      );
      if (!user) return;

      const tz = String(user.time_zone);
      const quietStart = Number(user.quiet_start_min);
      const quietEnd = Number(user.quiet_end_min);
      const { minute } = localNow(now(), tz);

      if (isInQuietHours(minute, quietStart, quietEnd)) {
        const deferMinutes = minutesUntilQuietEnd(minute, quietEnd);
        const deferAt = new Date(now().getTime() + deferMinutes * 60_000);
        await enqueue(db, 'push.chat_draft', payload as Record<string, unknown>, {
          runAt: deferAt,
          dedupeKey: `chat_draft:${p.plan_id}:deferred`,
        });
        log({
          kind: 'push.chat_draft',
          msg: 'deferred to quiet-hours end',
          planId: p.plan_id,
          deferMinutes,
        });
        return;
      }

      const { rows: devices } = await db.execute<Row>(
        sql`select id, apns_token from devices where user_id = ${p.user_id} and apns_token is not null`,
      );
      if (devices.length === 0) return;

      const changeWord = p.change_count === 1 ? '1 change' : `${p.change_count} changes`;
      const body = `${p.client_name} sent a plan from chat · ${changeWord} to ${p.term_name}. Review and approve here.`;

      if (config.APNS_MODE === 'log') {
        for (const d of devices) {
          log({
            kind: 'push.chat_draft',
            msg: 'CHAT_DRAFT',
            planId: p.plan_id,
            deviceId: String(d.id),
            body,
            url: `dialed://plan/${p.plan_id}`,
          });
        }
        return;
      }
      // APNS_MODE=apns: real push not activated yet (see config guard)
    },

    'plans.sweep': async (_payload: unknown) => {
      const twoMinAgo = new Date(now().getTime() - 2 * 60_000);
      const { rows } = await db.execute<Row>(sql`
        update plans set status = 'failed', error_code = 'timeout'
        where status = 'drafting' and created_at < ${twoMinAgo.toISOString()}::timestamptz
        returning id`);
      if (rows.length > 0) {
        log({
          kind: 'plans.sweep',
          msg: `swept ${rows.length} stale plans`,
          ids: rows.map((r) => r.id),
        });
      }
    },
  };
}

export function isInQuietHours(minute: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false;
  if (quietStart < quietEnd) return minute >= quietStart && minute < quietEnd;
  return minute >= quietStart || minute < quietEnd;
}

export function minutesUntilQuietEnd(minute: number, quietEnd: number): number {
  if (minute < quietEnd) return quietEnd - minute;
  return 1440 - minute + quietEnd;
}
