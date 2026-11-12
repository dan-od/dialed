import type { PlanChange, PlanCheck } from '@dialed/contracts';
import type { ScheduleData, IsoDate } from '@dialed/schedule';
import { protectionNote, validate, type ValidateError, type ValidateProfile } from './validate';
import type { PlanProvider, ProviderMessage, ToolCall } from './providers/types';
import type { PlanningContext } from './context';
import { runReadTool } from './read-tools';

export interface PlanLimits {
  maxToolTurns: number;
  maxWallMs: number;
  maxCallMs: number;
  maxTokens: number;
  maxRetries: number;
  maxValidationRounds: number;
  /** Questions per plan; after this many the model must propose or the run fails (too_many_questions). */
  maxQuestions: number;
}

export const DEFAULT_LIMITS: PlanLimits = {
  maxToolTurns: 8,
  maxWallMs: 90_000,
  maxCallMs: 60_000,
  maxTokens: 8192,
  maxRetries: 3,
  maxValidationRounds: 3,
  maxQuestions: 2,
};

export interface ToolContext {
  data: ScheduleData;
  today: IsoDate;
  source: 'in_app' | 'mcp';
  profile?: ValidateProfile;
  revision: number;
  timeZone: string;
}

export type PlanStepKind = 'call' | 'tool_result' | 'propose' | 'question' | 'validate_error';

export interface PlanStep {
  kind: PlanStepKind;
  detail?: string;
  /** validate_error: that round's errors. */
  errors?: ValidateError[];
  tokens_in?: number;
  tokens_out?: number;
}

export type RunPlanResult =
  | {
      status: 'ready';
      changes: PlanChange[];
      checks: PlanCheck[];
      tokensIn: number;
      tokensOut: number;
    }
  | { status: 'question'; question: string; options: string[]; tokensIn: number; tokensOut: number }
  | {
      status: 'failed';
      error: string;
      code: string;
      /** Provider HTTP status and a truncated error body, for logs only. */
      detail?: { status?: number; body?: string };
      /** validation_failed: the last round's errors (stored on the plan for the Planner's copy). */
      validationErrors?: ValidateError[];
      tokensIn: number;
      tokensOut: number;
    }
  | { status: 'nothing'; text: string; tokensIn: number; tokensOut: number };

export interface RunPlanOpts {
  provider: PlanProvider;
  guide: string;
  /** The Planner's original request. */
  request: string;
  /** Everything after the request, in order: questions (assistant), answers and replies (user). */
  history: ProviderMessage[];
  toolSchemas: { name: string; description: string; input_schema: object }[];
  ctx: ToolContext;
  /** Preloaded schedule (D-123), put in the first user message so the guide stays a cacheable system prompt. */
  context?: PlanningContext;
  limits?: Partial<PlanLimits>;
  /** Sampling temperature for every call (PLAN_TEMPERATURE); undefined → provider default. */
  temperature?: number;
  /** Non-fatal provider notes (e.g. temperature rejected and dropped), for the run log. */
  onWarning?: (message: string) => void;
  skipValidation?: boolean;
  signal?: AbortSignal;
  onStep?: (step: PlanStep) => void;
}

export async function runPlan(opts: RunPlanOpts): Promise<RunPlanResult> {
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const questionsAsked = opts.history.filter((m) => m.role === 'assistant').length;
  const atQuestionCap = questionsAsked >= limits.maxQuestions;
  const plannerWords = [
    opts.request,
    ...opts.history.filter((m) => m.role === 'user').map((m) => m.content),
  ].join('\n');
  const messages = conversation(
    opts,
    atQuestionCap ? limits.maxQuestions : null,
    protectionNote(plannerWords, opts.ctx.data),
  );
  const tools = atQuestionCap
    ? opts.toolSchemas.filter((t) => t.name !== 'ask_user')
    : opts.toolSchemas;
  const validateCtx = { ...opts.ctx, refs: opts.context?.refs };
  let totalIn = 0;
  let totalOut = 0;
  let turns = 0;
  let validationRounds = 0;

  const start = Date.now();

  while (turns < limits.maxToolTurns) {
    if (opts.signal?.aborted) {
      return {
        status: 'failed',
        error: 'Cancelled.',
        code: 'cancelled',
        tokensIn: totalIn,
        tokensOut: totalOut,
      };
    }
    if (Date.now() - start > limits.maxWallMs) {
      return {
        status: 'failed',
        error: 'Timed out.',
        code: 'provider_error',
        tokensIn: totalIn,
        tokensOut: totalOut,
      };
    }

    let response;
    try {
      response = await opts.provider.run({
        system: opts.guide,
        messages,
        tools,
        maxTokens: limits.maxTokens,
        temperature: opts.temperature,
        timeoutMs: limits.maxCallMs,
        onWarning: opts.onWarning,
        signal: opts.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Provider error';
      return {
        status: 'failed',
        error: msg,
        code:
          msg === 'provider_key_invalid'
            ? 'provider_key_invalid'
            : msg === 'request timed out'
              ? 'timeout'
              : 'provider_error',
        detail: providerDetail(err),
        tokensIn: totalIn,
        tokensOut: totalOut,
      };
    }

    totalIn += response.tokens_in;
    totalOut += response.tokens_out;
    turns++;
    opts.onStep?.({ kind: 'call', tokens_in: response.tokens_in, tokens_out: response.tokens_out });

    if (response.tool_calls.length === 0) {
      if (response.content) {
        return {
          status: 'nothing',
          text: response.content,
          tokensIn: totalIn,
          tokensOut: totalOut,
        };
      }
      return {
        status: 'failed',
        error: 'No response from provider.',
        code: 'provider_error',
        tokensIn: totalIn,
        tokensOut: totalOut,
      };
    }

    const call = response.tool_calls.find(
      (c) => c.name === 'propose_changes' || c.name === 'ask_user',
    );
    if (!call) {
      const results = response.tool_calls.map(
        (c) =>
          runReadTool(c, opts.ctx, opts.context) ?? {
            id: c.id,
            name: c.name,
            output: { error: `Unknown tool: ${c.name}` },
            is_error: true,
          },
      );
      for (const c of response.tool_calls) opts.onStep?.({ kind: 'tool_result', detail: c.name });
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      });
      messages.push({
        role: 'tool_result',
        content: JSON.stringify(results.map((r) => r.output)),
        tool_results: results,
      });
      continue;
    }

    if (call.name === 'ask_user') {
      if (atQuestionCap) {
        return {
          status: 'failed',
          error: `Asked ${limits.maxQuestions} questions without proposing a plan.`,
          code: 'too_many_questions',
          tokensIn: totalIn,
          tokensOut: totalOut,
        };
      }
      const input = call.input as { question: string; options: string[] };
      opts.onStep?.({ kind: 'question' });
      return {
        status: 'question',
        question: input.question,
        options: input.options,
        tokensIn: totalIn,
        tokensOut: totalOut,
      };
    }

    const input = call.input as { changes?: unknown; checks?: PlanCheck[] };
    const changes = readChanges(input.changes);
    // Protected blocks unlock only on the Planner's own words (request, answers, replies), never the model's.
    const result = opts.skipValidation
      ? { errors: [], checks: input.checks ?? [], changes }
      : validate({ request_text: plannerWords, changes }, validateCtx);

    if (result.errors.length > 0) {
      validationRounds++;
      opts.onStep?.({
        kind: 'validate_error',
        detail: `round ${validationRounds}`,
        errors: result.errors,
      });
      if (validationRounds >= limits.maxValidationRounds) {
        // Out of rounds: keep the changes that are valid on their own; the Planner still approves.
        const kept = salvage(changes, result.errors, plannerWords, validateCtx);
        if (kept) {
          opts.onStep?.({ kind: 'propose' });
          return { status: 'ready', ...kept, tokensIn: totalIn, tokensOut: totalOut };
        }
        return {
          status: 'failed',
          error: 'Could not produce a valid plan after multiple attempts.',
          code: 'validation_failed',
          validationErrors: result.errors,
          tokensIn: totalIn,
          tokensOut: totalOut,
        };
      }
      pushToolError(messages, call, { status: 'invalid', errors: result.errors });
      continue;
    }

    opts.onStep?.({ kind: 'propose' });
    return {
      status: 'ready',
      changes: result.changes as PlanChange[],
      checks: [...result.checks, ...(opts.skipValidation ? [] : (input.checks ?? []))],
      tokensIn: totalIn,
      tokensOut: totalOut,
    };
  }

  return {
    status: 'failed',
    error: 'Too many tool turns.',
    code: 'provider_error',
    tokensIn: totalIn,
    tokensOut: totalOut,
  };
}

/**
 * The conversation as the provider sees it: the context and the original request first, then the
 * questions and answers in order. Consecutive user turns are joined so roles always alternate, and at
 * the question cap the last user turn says to propose now.
 */
function conversation(
  opts: RunPlanOpts,
  questionCap: number | null,
  protection: string,
): ProviderMessage[] {
  const first = opts.context
    ? `${opts.context.text}\n${protection}\n\n---\n${opts.request}`
    : opts.request;
  const out: ProviderMessage[] = [{ role: 'user', content: first }];
  for (const m of opts.history) {
    const last = out.at(-1)!;
    if (m.role === 'user' && last.role === 'user' && !last.tool_results) {
      out[out.length - 1] = { ...last, content: `${last.content}\n\n${m.content}` };
    } else {
      out.push(m);
    }
  }
  if (questionCap !== null) {
    const last = out.at(-1)!;
    const note = `(You've asked ${questionCap} questions, the most allowed. Don't ask another: propose your best plan now with propose_changes and say what you assumed in the notes.)`;
    if (last.role === 'user')
      out[out.length - 1] = { ...last, content: `${last.content}\n\n${note}` };
    else out.push({ role: 'user', content: note });
  }
  return out;
}

const LEFT_OUT_REASON: Record<string, string> = {
  protected_block: 'protected class, not named',
  bad_time: 'time didn’t work',
  unknown_ref: 'not in your schedule',
  unknown_block: 'not in your schedule',
  unknown_category: 'unknown category',
  bad_change: 'couldn’t be read',
  duplicate_change: 'listed twice',
};

/**
 * Drops the changes that broke a rule and re-checks the rest, a few passes deep. Null when nothing
 * valid is left or an error belongs to the whole plan (overlap, range) and can't be pinned on a change.
 */
function salvage(
  changes: PlanChange[],
  errors: ValidateError[],
  words: string,
  ctx: Parameters<typeof validate>[1],
): { changes: PlanChange[]; checks: PlanCheck[] } | null {
  if (!Array.isArray(changes)) return null;
  let keep = changes;
  let errs = errors;
  const left: string[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const bad = new Map<number, ValidateError>();
    for (const e of errs)
      if (e.change_index >= 0 && !bad.has(e.change_index)) bad.set(e.change_index, e);
    if (bad.size === 0) return null;
    for (const [i, e] of bad) {
      const title = (keep[i] as { title?: unknown } | undefined)?.title;
      left.push(
        `${typeof title === 'string' ? title : 'a change'} (${LEFT_OUT_REASON[e.code] ?? 'broke a rule'})`,
      );
    }
    keep = keep.filter((_, i) => !bad.has(i));
    if (keep.length === 0) return null;
    const r = validate({ request_text: words, changes: keep }, ctx);
    if (r.errors.length === 0) {
      const detail = `Left out: ${left.join('; ')}.`;
      return {
        changes: r.changes as PlanChange[],
        checks: [
          ...r.checks,
          {
            id: 'left_out',
            passed: false,
            detail: detail.length > 200 ? `${detail.slice(0, 199)}…` : detail,
          },
        ],
      };
    }
    errs = r.errors;
  }
  return null;
}

function providerDetail(err: unknown): { status?: number; body?: string } {
  const e = err as { status?: unknown; body?: unknown };
  return {
    status: typeof e.status === 'number' ? e.status : undefined,
    body: typeof e.body === 'string' ? e.body.slice(0, 500) : undefined,
  };
}

/** `changes` as sent; some models send the array as a JSON string. Anything else is left for validate() to reject. */
function readChanges(raw: unknown): PlanChange[] {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as PlanChange[];
    } catch {
      return raw as unknown as PlanChange[];
    }
  }
  return raw as PlanChange[];
}

function pushToolError(messages: ProviderMessage[], call: ToolCall, output: unknown) {
  messages.push({ role: 'assistant', content: '', tool_calls: [call] });
  messages.push({
    role: 'tool_result',
    content: JSON.stringify(output),
    tool_results: [{ id: call.id, name: call.name, output, is_error: true }],
  });
}
