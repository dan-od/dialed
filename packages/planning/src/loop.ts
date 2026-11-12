import type { PlanChange, PlanCheck } from '@dialed/contracts';
import type { ScheduleData, IsoDate } from '@dialed/schedule';
import { validate, type ValidateProfile } from './validate';
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
  maxCallMs: 30_000,
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
  | { status: 'failed'; error: string; code: string; tokensIn: number; tokensOut: number }
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
  skipValidation?: boolean;
  signal?: AbortSignal;
  onStep?: (step: PlanStep) => void;
}

export async function runPlan(opts: RunPlanOpts): Promise<RunPlanResult> {
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const questionsAsked = opts.history.filter((m) => m.role === 'assistant').length;
  const atQuestionCap = questionsAsked >= limits.maxQuestions;
  const messages = conversation(opts, atQuestionCap ? limits.maxQuestions : null);
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
        signal: opts.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Provider error';
      return {
        status: 'failed',
        error: msg,
        code: 'provider_error',
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

    const input = call.input as {
      request_text?: string;
      changes: PlanChange[];
      checks?: PlanCheck[];
    };
    const result = opts.skipValidation
      ? { errors: [], checks: input.checks ?? [], changes: input.changes }
      : validate(
          { request_text: input.request_text ?? opts.request, changes: input.changes },
          validateCtx,
        );

    if (result.errors.length > 0) {
      validationRounds++;
      opts.onStep?.({ kind: 'validate_error', detail: `round ${validationRounds}` });
      if (validationRounds >= limits.maxValidationRounds) {
        return {
          status: 'failed',
          error: 'Could not produce a valid plan after multiple attempts.',
          code: 'validation_failed',
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
function conversation(opts: RunPlanOpts, questionCap: number | null): ProviderMessage[] {
  const first = opts.context ? `${opts.context.text}\n\n---\n${opts.request}` : opts.request;
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

function pushToolError(messages: ProviderMessage[], call: ToolCall, output: unknown) {
  messages.push({ role: 'assistant', content: '', tool_calls: [call] });
  messages.push({
    role: 'tool_result',
    content: JSON.stringify(output),
    tool_results: [{ id: call.id, name: call.name, output, is_error: true }],
  });
}
