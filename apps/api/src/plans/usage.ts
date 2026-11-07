import { sql } from 'drizzle-orm';
import type { Db } from '../db/pool';

export async function incrementUsage(
  db: Db,
  userId: string,
  day: string,
  tokensIn: number,
  tokensOut: number,
  counter: 'plan_runs' | 'imports' = 'plan_runs',
): Promise<void> {
  // Plan runs (Flow 06, PLAN_DAILY_LIMIT) and timetable reads (Flow 02, IMPORT_DAILY_LIMIT) are separate limits.
  const plans = counter === 'plan_runs' ? 1 : 0;
  const imports = counter === 'imports' ? 1 : 0;
  await db.execute(sql`
    insert into usage_counters (user_id, day, plan_runs, imports, tokens_in, tokens_out)
    values (${userId}, ${day}, ${plans}, ${imports}, ${tokensIn}, ${tokensOut})
    on conflict (user_id, day)
    do update set plan_runs = usage_counters.plan_runs + ${plans},
      imports = usage_counters.imports + ${imports},
      tokens_in = usage_counters.tokens_in + ${tokensIn},
      tokens_out = usage_counters.tokens_out + ${tokensOut}`);
}

export async function dailyPlanCount(db: Db, userId: string, day: string): Promise<number> {
  const { rows } = await db.execute<Record<string, unknown>>(sql`
    select plan_runs from usage_counters
    where user_id = ${userId} and day = ${day}`);
  return rows.length > 0 ? Number(rows[0]!.plan_runs) : 0;
}

export async function dailyImportCount(db: Db, userId: string, day: string): Promise<number> {
  const { rows } = await db.execute<Record<string, unknown>>(sql`
    select imports from usage_counters
    where user_id = ${userId} and day = ${day}`);
  return rows.length > 0 ? Number(rows[0]!.imports) : 0;
}
