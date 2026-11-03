import type { PlanChange, PlanCheck } from '@dialed/contracts';

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  output: unknown;
  is_error?: boolean;
}

export interface ProviderMessage {
  role: 'user' | 'assistant' | 'tool_result';
  content: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
}

export type ProviderStepResult =
  | { kind: 'tool_calls'; calls: ToolCall[] }
  | { kind: 'text'; text: string }
  | { kind: 'done' };

export interface PlanProvider {
  id: string;
  displayName: string;
  supportsVision: boolean;
  run(opts: {
    system: string;
    messages: ProviderMessage[];
    tools: { name: string; description: string; input_schema: object }[];
    maxTokens: number;
    signal?: AbortSignal;
  }): Promise<{ content: string; tool_calls: ToolCall[]; tokens_in: number; tokens_out: number }>;
}

export interface FixtureResult {
  changes: PlanChange[];
  checks: PlanCheck[];
}
