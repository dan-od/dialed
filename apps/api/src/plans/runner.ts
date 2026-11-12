import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assetRoot } from '../lib/assets';
import { sql } from 'drizzle-orm';
import { localNow, type ScheduleData } from '@dialed/schedule';
import {
  runPlan,
  loadFixtures,
  PLAN_TOOL_SCHEMAS,
  READ_TOOL_SCHEMAS,
  type ToolContext,
} from '@dialed/planning';
import type { Db } from '../db/pool';
import type { Config } from '../config';
import { PlanService } from './service';
import { createPlanProvider } from './provider-factory';
import { contextFor } from './context-cache';
import { renderGuide } from '../mcp/guide';

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

export interface PlanRunOpts {
  db: Db;
  config: Config;
  planService: PlanService;
  planId: string;
  userId: string;
  requestText: string;
  timeZone: string;
  now: () => Date;
  providerMode: 'server' | 'byo';
  provider?: string;
  byoKey?: string;
  byoBaseUrl?: string;
  log?: (obj: Record<string, unknown>) => void;
}

export async function startPlanRun(opts: PlanRunOpts): Promise<void> {
  const { db, config, planService, planId, userId, requestText, timeZone, now } = opts;
  const ctrl = new AbortController();
  activeRuns.set(planId, ctrl);
  const runStart = Date.now();

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
      sql`select display_name, profile_json, day_start_min, day_end_min, quiet_start_min, quiet_end_min
        from users where id = ${userId}`,
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

    const planProvider = createPlanProvider({
      config,
      providerMode: opts.providerMode,
      provider: opts.provider,
      byoKey: opts.byoKey,
      byoBaseUrl: opts.byoBaseUrl,
      requestText,
    });
    await db.execute(sql`update plans set provider = ${planProvider.id} where id = ${planId}`);

    const { rows: priorMsgs } = await db.execute<Row>(
      sql`select role, body from plan_messages where plan_id = ${planId} order by created_at`,
    );
    const history = priorMsgs.map((m) => ({
      role: (m.role === 'question' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: String(m.body),
    }));

    const toolSchemas =
      config.AI_MODE === 'fixture' ? [] : [...PLAN_TOOL_SCHEMAS, ...READ_TOOL_SCHEMAS];
    const context = contextFor(userId, ctx);
    let turns = 0;

    const result = await runPlan({
      provider: planProvider,
      guide: user ? renderGuide(guideTemplate, user) : guideTemplate,
      request: requestText,
      history,
      toolSchemas,
      ctx,
      context,
      onStep: (step) => {
        if (step.kind === 'call') turns++;
      },
      skipValidation: config.AI_MODE === 'fixture' && !!process.env.DEV_CLOCK,
      signal: ctrl.signal,
      limits: { maxTokens: config.PLAN_MAX_TOKENS },
    });

    const durationMs = Date.now() - runStart;
    opts.log?.({
      kind: 'plan.run',
      planId,
      provider: planProvider.id,
      model: planProvider.model,
      providerMode: opts.providerMode,
      contextTokens: context.tokens,
      turns,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      durationMs,
      status: result.status,
      errorCode: result.status === 'failed' ? result.code : undefined,
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
    const durationMs = Date.now() - runStart;
    const errCode = (err as { code?: string }).code;
    const code =
      errCode === 'byo_key_required'
        ? 'byo_key_required'
        : err instanceof Error && err.message === 'provider_error'
          ? 'provider_error'
          : 'server_error';
    opts.log?.({
      kind: 'plan.run',
      planId,
      providerMode: opts.providerMode,
      durationMs,
      status: 'failed',
      errorCode: code,
    });
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
