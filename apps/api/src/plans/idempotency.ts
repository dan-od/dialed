import { sql } from 'drizzle-orm';
import type { Db } from '../db/pool';

export async function findByIdempotencyKey(
  db: Db,
  userId: string,
  key: string,
): Promise<string | null> {
  const { rows } = await db.execute<Record<string, unknown>>(sql`
    select id from plans
    where user_id = ${userId} and idempotency_key = ${key}
    limit 1`);
  return rows.length > 0 ? String(rows[0]!.id) : null;
}
