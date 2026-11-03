import { sql } from 'drizzle-orm';
import type { Tx } from '../db/pool';

export async function isStale(
  tx: Tx,
  userId: string,
  baseRevision: number,
): Promise<boolean> {
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    select 1 as hit from change_log
    where user_id = ${userId}
      and revision > ${baseRevision}
      and entity in ('routine_block', 'override', 'category', 'term')
    limit 1`);
  return rows.length > 0;
}
