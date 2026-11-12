import type { PlanProvider, ProviderRunOpts, ProviderStepResult, ToolCall } from './types';
import { safeFetch, type SafeFetchOpts } from './http';

export interface GeminiProviderOpts {
  apiKey: string;
  model: string;
}

export function createGeminiProvider(opts: GeminiProviderOpts): PlanProvider {
  return {
    id: 'gemini',
    displayName: 'Gemini',
    model: opts.model,
    supportsVision: true,

    async run(runOpts: ProviderRunOpts): Promise<ProviderStepResult> {
      const tools =
        runOpts.tools.length > 0
          ? [
              {
                functionDeclarations: runOpts.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parameters: t.input_schema,
                })),
              },
            ]
          : undefined;

      const contents: object[] = [];
      if (runOpts.system) {
        contents.push({ role: 'user', parts: [{ text: `System: ${runOpts.system}` }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
      }
      for (const m of runOpts.messages) {
        if (m.tool_calls?.length) {
          contents.push({
            role: 'model',
            parts: m.tool_calls.map((tc) => ({
              functionCall: { name: tc.name, args: tc.input },
            })),
          });
        } else if (m.tool_results?.length) {
          contents.push({
            role: 'user',
            parts: m.tool_results.map((tr) => ({
              functionResponse: {
                name: tr.name,
                response: typeof tr.output === 'string' ? { result: tr.output } : tr.output,
              },
            })),
          });
        } else {
          contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          });
        }
      }

      const body = JSON.stringify({
        contents,
        ...(tools ? { tools } : {}),
        generationConfig: {
          maxOutputTokens: runOpts.maxTokens,
          ...(runOpts.temperature !== undefined ? { temperature: runOpts.temperature } : {}),
        },
      });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${opts.apiKey}`;
      const fetchOpts: SafeFetchOpts = {
        url,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        timeoutMs: runOpts.signal ? undefined : 30_000,
        signal: runOpts.signal,
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
        candidates: Array<{
          content: {
            parts: Array<{
              text?: string;
              functionCall?: { name: string; args: Record<string, unknown> };
            }>;
          };
        }>;
        usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
      };

      const parts = data.candidates?.[0]?.content?.parts ?? [];
      let content = '';
      const toolCalls: ToolCall[] = [];

      for (const part of parts) {
        if (part.text) content += part.text;
        if (part.functionCall) {
          toolCalls.push({
            name: part.functionCall.name,
            input: part.functionCall.args,
          });
        }
      }

      return {
        content,
        tool_calls: toolCalls,
        tokens_in: data.usageMetadata?.promptTokenCount ?? 0,
        tokens_out: data.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  };
}
