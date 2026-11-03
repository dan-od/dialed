import { sql } from 'drizzle-orm';
import { localNow } from '@dialed/schedule';
import type { Db } from '../db/pool';
import type { Config } from '../config';
import { PlanService } from '../plans/service';
import { startPlanRun, initRunner } from '../plans/runner';
import { enqueue } from './enqueue';

type Row = Record<string, unknown>;

export interface HandlerDeps {
  db: Db;
  config: Config;
  now: () => Date;
  log: (obj: Record<string, unknown>) => void;
}

export function createHandlers(deps: HandlerDeps) {
  const { db, config, now, log } = deps;
  const planService = new PlanService(db, config, now);

  return {
    'plan.retry': async (payload: unknown) => {
      const p = payload as { plan_id: string; user_id: string; request_text: string; time_zone: string };
      if (!config.ANTHROPIC_API_KEY) {
        log({ kind: 'plan.retry', msg: 'no server key configured, skipping retry', planId: p.plan_id });
        return;
      }

      const { rows: [plan] } = await db.execute<Row>(
        sql`select status, attempts from plans where id = ${p.plan_id}`,
      );
      if (!plan || String(plan.status) !== 'failed') return;
      if (Number(plan.attempts) > 1) return;

      await db.execute(sql`update plans set status = 'drafting', bg_retry_at = now() where id = ${p.plan_id}`);
      initRunner(config);

      try {
        await startPlanRun(db, config, planService, p.plan_id, p.user_id, p.request_text, p.time_zone, now);
      } catch {
        // startPlanRun stores the failure itself
      }

      const { rows: [after] } = await db.execute<Row>(
        sql`select status from plans where id = ${p.plan_id}`,
      );
      if (String(after?.status) === 'ready') {
        await enqueue(db, 'push.plan_ready', { plan_id: p.plan_id, user_id: p.user_id }, {
          dedupeKey: `push:${p.plan_id}`,
        });
      }
    },

    'push.plan_ready': async (payload: unknown) => {
      const p = payload as { plan_id: string; user_id: string };

      if (config.APPLE_TEAM_TIER === 'personal') {
        log({ kind: 'push.plan_ready', msg: 'personal tier — push skipped', planId: p.plan_id });
        return;
      }

      const { rows: [user] } = await db.execute<Row>(
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
        await enqueue(db, 'push.plan_ready', { plan_id: p.plan_id, user_id: p.user_id }, {
          runAt: deferAt,
          dedupeKey: `push:${p.plan_id}:deferred`,
        });
        log({ kind: 'push.plan_ready', msg: 'deferred to quiet-hours end', planId: p.plan_id, deferMinutes });
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

    'plans.sweep': async (_payload: unknown) => {
      const twoMinAgo = new Date(now().getTime() - 2 * 60_000);
      const { rows } = await db.execute<Row>(sql`
        update plans set status = 'failed', error_code = 'timeout'
        where status = 'drafting' and created_at < ${twoMinAgo.toISOString()}::timestamptz
        returning id`);
      if (rows.length > 0) {
        log({ kind: 'plans.sweep', msg: `swept ${rows.length} stale plans`, ids: rows.map((r) => r.id) });
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
  return (1440 - minute) + quietEnd;
}
