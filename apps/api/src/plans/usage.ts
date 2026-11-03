import { sql } from 'drizzle-orm';
import type { Db } from '../db/pool';

export async function incrementUsage(
  db: Db,
  userId: string,
  day: string,
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  await db.execute(sql`
    insert into usage_counters (user_id, day, plan_runs, tokens_in, tokens_out)
    values (${userId}, ${day}, 1, ${tokensIn}, ${tokensOut})
    on conflict (user_id, day)
    do update set plan_runs = usage_counters.plan_runs + 1,
      tokens_in = usage_counters.tokens_in + ${tokensIn},
      tokens_out = usage_counters.tokens_out + ${tokensOut}`);
}

export async function dailyPlanCount(db: Db, userId: string, day: string): Promise<number> {
  const { rows } = await db.execute<Record<string, unknown>>(sql`
    select plan_runs from usage_counters
    where user_id = ${userId} and day = ${day}`);
  return rows.length > 0 ? Number(rows[0]!.plan_runs) : 0;
}
