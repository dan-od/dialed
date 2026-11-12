import type { PlanProvider, ProviderRunOpts, ProviderStepResult, ToolCall } from './types';
import { safeFetch, type SafeFetchOpts } from './http';
import { withTemperatureFallback } from './temperature';
import { DEFAULT_CALL_MS } from './types';

export interface AnthropicProviderOpts {
  apiKey: string;
  model: string;
  baseUrl?: string;
  allowPrivate?: boolean;
}

export function createAnthropicProvider(opts: AnthropicProviderOpts): PlanProvider {
  const base = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');

  // Set once a model rejects temperature, so later turns don't pay a failed call.
  const state = { dropTemperature: false };

  return {
    id: 'anthropic',
    displayName: 'Claude',
    model: opts.model,
    supportsVision: true,

    async run(runOpts: ProviderRunOpts): Promise<ProviderStepResult> {
      const tools = runOpts.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));

      const messages = runOpts.messages.map((m) => {
        if (m.tool_calls?.length) {
          return {
            role: 'assistant' as const,
            content: [
              ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
              ...m.tool_calls.map((tc) => ({
                type: 'tool_use' as const,
                id: tc.id ?? tc.name,
                name: tc.name,
                input: tc.input,
              })),
            ],
          };
        }
        if (m.tool_results?.length) {
          return {
            role: 'user' as const,
            content: m.tool_results.map((tr) => ({
              type: 'tool_result' as const,
              tool_use_id: tr.id ?? tr.name,
              content: typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output),
              is_error: tr.is_error,
            })),
          };
        }
        return { role: m.role, content: m.content };
      });

      const bodyFor = (temperature: number | undefined) =>
        JSON.stringify({
          model: opts.model,
          max_tokens: runOpts.maxTokens,
          ...(temperature !== undefined ? { temperature } : {}),
          ...(runOpts.system
            ? {
                system: [
                  { type: 'text', text: runOpts.system, cache_control: { type: 'ephemeral' } },
                ],
              }
            : {}),
          messages,
          ...(tools.length > 0 ? { tools } : {}),
        });

      const fetchOpts: SafeFetchOpts = {
        url: `${base}/v1/messages`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeoutMs: runOpts.timeoutMs ?? DEFAULT_CALL_MS,
        signal: runOpts.signal,
        allowPrivate: opts.allowPrivate,
      };

      const res = await withTemperatureFallback(
        state,
        runOpts.temperature,
        opts.model,
        runOpts.onWarning,
        (temperature) => safeFetch({ ...fetchOpts, body: bodyFor(temperature) }),
      );

      if (res.status === 401 || res.status === 403) {
        throw Object.assign(new Error('provider_key_invalid'), { status: res.status });
      }
      if (res.status >= 500 || res.status === 429) {
        throw Object.assign(new Error('provider_error'), { status: res.status });
      }
      if (res.status !== 200) {
        throw Object.assign(new Error('provider_error'), { status: res.status, body: res.body });
      }

      const data = JSON.parse(res.body) as {
        content: Array<{
          type: string;
          text?: string;
          id?: string;
          name?: string;
          input?: unknown;
        }>;
        usage: {
          input_tokens: number;
          output_tokens: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };

      let content = '';
      const toolCalls: ToolCall[] = [];

      for (const block of data.content) {
        if (block.type === 'text') content += block.text ?? '';
        if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name!,
            input: block.input as Record<string, unknown>,
          });
        }
      }

      return {
        content,
        tool_calls: toolCalls,
        // input_tokens excludes cached reads/writes; count them so limits and logs see the whole prompt.
        tokens_in:
          data.usage.input_tokens +
          (data.usage.cache_read_input_tokens ?? 0) +
          (data.usage.cache_creation_input_tokens ?? 0),
        tokens_out: data.usage.output_tokens,
      };
    },
  };
}
