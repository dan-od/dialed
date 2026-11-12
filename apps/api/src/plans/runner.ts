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
  type PlanProvider,
  type ToolContext,
  type ValidateError,
} from '@dialed/planning';
import type { Db } from '../db/pool';
import type { Config } from '../config';
import { PlanService } from './service';
import { createPlanProvider } from './provider-factory';
import { contextFor } from './context-cache';
import { queueBackgroundRetry } from './background-retry';
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
  let planProvider: PlanProvider | undefined;
  let contextTokens: number | undefined;
  let turns = 0;
  const rounds: ValidateError[][] = [];

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

    planProvider = createPlanProvider({
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
    contextTokens = context.tokens;

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
        if (step.kind === 'validate_error' && step.errors) rounds.push(step.errors);
      },
      temperature: config.AI_MODE === 'fixture' ? undefined : config.PLAN_TEMPERATURE,
      onWarning: (message) =>
        opts.log?.({
          kind: 'plan.warning',
          level: 'warn',
          planId,
          provider: planProvider?.id,
          model: planProvider?.model,
          message: redact(message).slice(0, 300),
        }),
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
      ...(rounds.length ? { validation: roundsForLog(rounds) } : {}),
      ...(result.status === 'failed'
        ? {
            error: {
              message: redact(result.error).slice(0, 300),
              status: result.detail?.status,
              body: result.detail?.body ? redact(result.detail.body) : undefined,
            },
          }
        : {}),
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
    // The newest round's errors, so the app can say why a draft failed (or what a partial plan dropped).
    const lastErrors = rounds.at(-1);
    await db.execute(sql`update plans set validation_errors_json =
      ${lastErrors ? JSON.stringify(lastErrors) : null}::jsonb where id = ${planId}`);
  } catch (err) {
    const durationMs = Date.now() - runStart;
    const e = (err ?? {}) as {
      message?: unknown;
      code?: unknown;
      status?: unknown;
      body?: unknown;
      stack?: unknown;
    };
    const message = typeof e.message === 'string' ? e.message : String(err);
    const errCode = typeof e.code === 'string' ? e.code : undefined;
    const code =
      errCode === 'byo_key_required'
        ? 'byo_key_required'
        : message === 'provider_key_invalid'
          ? 'provider_key_invalid'
          : message === 'provider_error'
            ? 'provider_error'
            : 'server_error';
    // Cause of the failure for the owner; keys are redacted and the request text is never included.
    opts.log?.({
      kind: 'plan.run',
      planId,
      provider: planProvider?.id,
      model: planProvider?.model,
      providerMode: opts.providerMode,
      contextTokens,
      turns,
      ...(rounds.length ? { validation: roundsForLog(rounds) } : {}),
      durationMs,
      status: 'failed',
      errorCode: code,
      error: {
        message: redact(message).slice(0, 300),
        code: errCode,
        status: typeof e.status === 'number' ? e.status : undefined,
        body:
          e.body === undefined
            ? undefined
            : redact(typeof e.body === 'string' ? e.body : JSON.stringify(e.body)).slice(0, 500),
        stack: typeof e.stack === 'string' ? redact(e.stack).slice(0, 1500) : undefined,
      },
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
  // A third failed attempt on a network problem gets one background try (Flow 06).
  try {
    if (await queueBackgroundRetry(db, planId, now)) {
      opts.log?.({ kind: 'plan.retry', msg: 'background retry queued', planId });
    }
  } catch (err) {
    opts.log?.({
      kind: 'plan.retry',
      level: 'warn',
      msg: 'could not queue background retry',
      planId,
      error: redact(String((err as Error)?.message ?? err)).slice(0, 200),
    });
  }
}

/** Strips anything shaped like an API key (sk-…, AIza…, bearer tokens) before it reaches a log line. */
function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-[redacted]')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, 'AIza[redacted]')
    .replace(/(bearer\s+)[A-Za-z0-9._-]{12,}/gi, '$1[redacted]');
}

/** Each validation round as rule code, change index and a short message, for the plan.run log line. */
function roundsForLog(rounds: ValidateError[][]) {
  return rounds.map((errors, i) => ({
    round: i + 1,
    errors: errors.map((e) => ({
      code: e.code,
      i: e.change_index,
      msg: redact(e.message).slice(0, 100),
    })),
  }));
}
