import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetRoot } from '../lib/assets';
import { sql } from 'drizzle-orm';
import { localNow, type ScheduleData } from '@dialed/schedule';
import { runPlan, loadFixtures, createFixtureProvider, type ToolContext } from '@dialed/planning';
import type { Db } from '../db/pool';
import type { Config } from '../config';
import { PlanService } from './service';

type Row = Record<string, unknown>;

const activeRuns = new Map<string, AbortController>();

export function cancelRun(planId: string) {
  const ctrl = activeRuns.get(planId);
  if (ctrl) {
    ctrl.abort();
    activeRuns.delete(planId);
  }
}

let guideTemplate = '';

export function initRunner(config: Config) {
  const root = assetRoot();
  guideTemplate = readFileSync(join(root, 'mcp', 'planning-guide.md'), 'utf8');
  if (config.AI_MODE === 'fixture') {
    try {
      loadFixtures(join(root, 'backend', 'seed', 'fixtures', 'plans'));
    } catch {
      // No fixtures dir in test — provider will create fixtures inline
    }
  }
}

export async function loadScheduleData(db: Db, userId: string): Promise<ScheduleData> {
  const q = async (query: ReturnType<typeof sql>) => (await db.execute<Row>(query)).rows;
  return {
    categories: (await q(sql`select * from categories where user_id = ${userId}`)).map((c) => ({
      ...c,
      weight: Number(c.weight),
    })),
    terms: await q(sql`select * from terms where user_id = ${userId}`),
    routines: await q(sql`select * from routines where user_id = ${userId}`),
    routineBlocks: await q(sql`select * from routine_blocks where user_id = ${userId}`),
    overrides: await q(sql`select * from overrides where user_id = ${userId}`),
  } as unknown as ScheduleData;
}

export async function startPlanRun(
  db: Db,
  config: Config,
  planService: PlanService,
  planId: string,
  userId: string,
  requestText: string,
  timeZone: string,
  now: () => Date,
): Promise<void> {
  const ctrl = new AbortController();
  activeRuns.set(planId, ctrl);

  try {
    const data = await loadScheduleData(db, userId);
    const {
      rows: [revRow],
    } = await db.execute<Row>(sql`select revision from revisions where user_id = ${userId}`);
    const revision = revRow ? Number(revRow.revision) : 0;
    const today = localNow(now(), timeZone).date;
    const {
      rows: [user],
    } = await db.execute<Row>(
      sql`select day_start_min, day_end_min, quiet_start_min, quiet_end_min from users where id = ${userId}`,
    );

    const ctx: ToolContext = {
      data,
      today,
      source: 'in_app',
      revision,
      timeZone,
      profile: user
        ? {
            day_start_min: Number(user.day_start_min),
            day_end_min: Number(user.day_end_min),
            quiet_start_min: Number(user.quiet_start_min),
            quiet_end_min: Number(user.quiet_end_min),
          }
        : undefined,
    };

    const provider = createFixtureProvider(requestText);

    const { rows: priorMsgs } = await db.execute<Row>(
      sql`select role, body from plan_messages where plan_id = ${planId} order by created_at`,
    );
    const history = priorMsgs.map((m) => ({
      role: (m.role === 'question' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: String(m.body),
    }));

    const result = await runPlan({
      provider,
      guide: guideTemplate,
      request: requestText,
      history,
      toolSchemas: [],
      ctx,
      skipValidation: config.AI_MODE === 'fixture' && !!process.env.DEV_CLOCK,
      signal: ctrl.signal,
      limits: { maxTokens: config.PLAN_MAX_TOKENS },
    });

    switch (result.status) {
      case 'ready':
        await planService.storeResult(
          planId,
          userId,
          'ready',
          result.changes,
          result.checks,
          result.tokensIn,
          result.tokensOut,
        );
        break;
      case 'question':
        await planService.storeResult(
          planId,
          userId,
          'question',
          [],
          [],
          result.tokensIn,
          result.tokensOut,
          { question: result.question, options: result.options },
        );
        break;
      case 'failed':
        await planService.storeResult(
          planId,
          userId,
          'failed',
          [],
          [],
          result.tokensIn,
          result.tokensOut,
          { errorCode: result.code },
        );
        break;
      case 'nothing':
        await planService.storeResult(
          planId,
          userId,
          'ready',
          [],
          [],
          result.tokensIn,
          result.tokensOut,
        );
        break;
    }
  } catch (err) {
    const code =
      err instanceof Error && err.message === 'provider_error' ? 'provider_error' : 'server_error';
    try {
      await planService.storeResult(planId, userId, 'failed', [], [], 0, 0, { errorCode: code });
    } catch {
      await db.execute(sql`update plans set status = 'failed', error_code = ${code},
        attempts = attempts + 1 where id = ${planId}`);
    }
  } finally {
    activeRuns.delete(planId);
  }
}
