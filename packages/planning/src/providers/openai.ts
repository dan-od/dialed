import type { PlanProvider, ProviderRunOpts, ProviderStepResult, ToolCall } from './types';
import { safeFetch, type SafeFetchOpts } from './http';

export interface OpenAIProviderOpts {
  apiKey: string;
  model: string;
  baseUrl?: string;
  allowPrivate?: boolean;
}

export function createOpenAIProvider(opts: OpenAIProviderOpts): PlanProvider {
  const base = (opts.baseUrl ?? 'https://api.openai.com').replace(/\/$/, '');

  return {
    id: opts.baseUrl ? 'custom' : 'openai',
    displayName: opts.baseUrl ? 'Custom' : 'OpenAI',
    model: opts.model,
    supportsVision: true,

    async run(runOpts: ProviderRunOpts): Promise<ProviderStepResult> {
      const tools = runOpts.tools.map((t) => ({
        type: 'function' as const,
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));

      const messages: object[] = [];
      if (runOpts.system) {
        messages.push({ role: 'system', content: runOpts.system });
      }
      for (const m of runOpts.messages) {
        if (m.tool_calls?.length) {
          messages.push({
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.tool_calls.map((tc) => ({
              id: tc.id ?? tc.name,
              type: 'function',
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            })),
          });
        } else if (m.tool_results?.length) {
          for (const tr of m.tool_results) {
            messages.push({
              role: 'tool',
              tool_call_id: tr.id ?? tr.name,
              content: typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output),
            });
          }
        } else {
          messages.push({ role: m.role, content: m.content });
        }
      }

      const body = JSON.stringify({
        model: opts.model,
        max_tokens: runOpts.maxTokens,
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });

      const fetchOpts: SafeFetchOpts = {
        url: `${base}/v1/chat/completions`,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body,
        timeoutMs: runOpts.signal ? undefined : 30_000,
        signal: runOpts.signal,
        allowPrivate: opts.allowPrivate,
      };

      const res = await safeFetch(fetchOpts);

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
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };

      const msg = data.choices[0]?.message;
      const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      }));

      return {
        content: msg?.content ?? '',
        tool_calls: toolCalls,
        tokens_in: data.usage.prompt_tokens,
        tokens_out: data.usage.completion_tokens,
      };
    },
  };
}
