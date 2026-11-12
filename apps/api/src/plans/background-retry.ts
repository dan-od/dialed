import { sql } from 'drizzle-orm';
import type { Db } from '../db/pool';
import { enqueue } from '../jobs/enqueue';
import { MAX_REDOS } from './service';

type Row = Record<string, unknown>;

/** Flow 06: after the third failed attempt the server tries once more, this long after. */
export const BG_RETRY_DELAY_MS = 10 * 60_000;

/** Failures a later try can fix. Rule failures, key problems, limits and cancels can't. */
const NETWORK_CODES = new Set(['provider_error', 'server_error', 'timeout']);

export const bgRetryKey = (planId: string) => `plan.retry:${planId}`;

/**
 * Queues the one background retry when a server-key plan has just failed its last attempt on a network
 * problem. Own-key plans are skipped (keys are never stored, D-13). Returns whether it queued one.
 */
export async function queueBackgroundRetry(db: Db, planId: string, now: () => Date) {
  const runAt = new Date(now().getTime() + BG_RETRY_DELAY_MS);
  const { rows } = await db.execute<Row>(sql`
    update plans set bg_retry_at = ${runAt.toISOString()}::timestamptz
    where id = ${planId} and status = 'failed' and attempts >= ${MAX_REDOS}
      and coalesce(provider_mode, 'server') = 'server' and bg_retry_at is null
      and error_code in (${sql.join(
        [...NETWORK_CODES].map((c) => sql`${c}`),
        sql`, `,
      )})
    returning user_id`);
  const plan = rows[0];
  if (!plan) return false;
  await enqueue(
    db,
    'plan.retry',
    { plan_id: planId, user_id: String(plan.user_id) },
    { runAt, dedupeKey: bgRetryKey(planId) },
  );
  return true;
}

/** `queued` while the retry waits or runs, `done` once it ran, null when none was queued. */
export function backgroundRetryState(
  bgRetryAt: unknown,
  jobStatus: unknown,
): 'queued' | 'done' | null {
  if (!bgRetryAt) return null;
  return jobStatus === 'done' || jobStatus === 'dead' ? 'done' : 'queued';
}
