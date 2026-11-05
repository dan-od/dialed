import type { PlanChange, PlanCheck } from '@dialed/contracts';
import type { ScheduleData, IsoDate } from '@dialed/schedule';
import { validate, type ValidateProfile } from './validate';
import type { PlanProvider, ProviderMessage, ToolCall } from './providers/types';

export interface PlanLimits {
  maxToolTurns: number;
  maxWallMs: number;
  maxCallMs: number;
  maxTokens: number;
  maxRetries: number;
  maxValidationRounds: number;
}

export const DEFAULT_LIMITS: PlanLimits = {
  maxToolTurns: 8,
  maxWallMs: 90_000,
  maxCallMs: 30_000,
  maxTokens: 8192,
  maxRetries: 3,
  maxValidationRounds: 3,
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
  | { status: 'ready'; changes: PlanChange[]; checks: PlanCheck[]; tokensIn: number; tokensOut: number }
  | { status: 'question'; question: string; options: string[]; tokensIn: number; tokensOut: number }
  | { status: 'failed'; error: string; code: string; tokensIn: number; tokensOut: number }
  | { status: 'nothing'; text: string; tokensIn: number; tokensOut: number };

export interface RunPlanOpts {
  provider: PlanProvider;
  guide: string;
  request: string;
  history: ProviderMessage[];
  toolSchemas: { name: string; description: string; input_schema: object }[];
  ctx: ToolContext;
  limits?: Partial<PlanLimits>;
  skipValidation?: boolean;
  signal?: AbortSignal;
  onStep?: (step: PlanStep) => void;
}

export async function runPlan(opts: RunPlanOpts): Promise<RunPlanResult> {
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const messages: ProviderMessage[] = [
    ...opts.history,
    { role: 'user', content: opts.request },
  ];
  let totalIn = 0;
  let totalOut = 0;
  let turns = 0;
  let validationRounds = 0;

  const start = Date.now();

  while (turns < limits.maxToolTurns) {
    if (opts.signal?.aborted) {
      return { status: 'failed', error: 'Cancelled.', code: 'cancelled', tokensIn: totalIn, tokensOut: totalOut };
    }
    if (Date.now() - start > limits.maxWallMs) {
      return { status: 'failed', error: 'Timed out.', code: 'provider_error', tokensIn: totalIn, tokensOut: totalOut };
    }

    let response;
    try {
      response = await opts.provider.run({
        system: opts.guide,
        messages,
        tools: opts.toolSchemas,
        maxTokens: limits.maxTokens,
        signal: opts.signal,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Provider error';
      return { status: 'failed', error: msg, code: 'provider_error', tokensIn: totalIn, tokensOut: totalOut };
    }

    totalIn += response.tokens_in;
    totalOut += response.tokens_out;
    turns++;
    opts.onStep?.({ kind: 'call', tokens_in: response.tokens_in, tokens_out: response.tokens_out });

    if (response.tool_calls.length === 0) {
      if (response.content) {
        return { status: 'nothing', text: response.content, tokensIn: totalIn, tokensOut: totalOut };
      }
      return { status: 'failed', error: 'No response from provider.', code: 'provider_error', tokensIn: totalIn, tokensOut: totalOut };
    }

    for (const call of response.tool_calls) {
      if (call.name === 'propose_changes') {
        const input = call.input as { request_text?: string; changes: PlanChange[]; checks?: PlanCheck[] };
        const result = opts.skipValidation
          ? { errors: [], checks: input.checks ?? [], ops: [] }
          : validate(
            { request_text: input.request_text ?? opts.request, changes: input.changes },
            opts.ctx,
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
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: [call],
          });
          messages.push({
            role: 'tool_result',
            content: JSON.stringify({ status: 'invalid', errors: result.errors }),
            tool_results: [{ name: 'propose_changes', output: { status: 'invalid', errors: result.errors }, is_error: true }],
          });
          continue;
        }

        opts.onStep?.({ kind: 'propose' });
        return {
          status: 'ready',
          changes: input.changes,
          checks: [...result.checks, ...(input.checks ?? [])],
          tokensIn: totalIn,
          tokensOut: totalOut,
        };
      }

      if (call.name === 'ask_user') {
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

      opts.onStep?.({ kind: 'tool_result', detail: call.name });
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [call],
      });
      messages.push({
        role: 'tool_result',
        content: JSON.stringify({ error: `Unknown tool: ${call.name}` }),
        tool_results: [{ name: call.name, output: { error: `Unknown tool: ${call.name}` }, is_error: true }],
      });
    }
  }

  return { status: 'failed', error: 'Too many tool turns.', code: 'provider_error', tokensIn: totalIn, tokensOut: totalOut };
}
