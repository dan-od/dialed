import { sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/pool';

export interface EnqueueOpts {
  runAt?: Date;
  dedupeKey?: string;
}

export async function enqueue(
  tx: Db | Tx,
  kind: string,
  payload: Record<string, unknown>,
  opts: EnqueueOpts = {},
): Promise<number | null> {
  const runAt = opts.runAt ?? new Date();
  const dedupeKey = opts.dedupeKey ?? null;
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    insert into jobs (kind, payload_json, run_at, dedupe_key)
    values (${kind}, ${JSON.stringify(payload)}::jsonb, ${runAt.toISOString()}::timestamptz, ${dedupeKey})
    on conflict (dedupe_key) do nothing
    returning id`);
  return rows[0] ? Number(rows[0].id) : null;
}
