import type { PlanChange, PlanCheck } from '@dialed/contracts';

export interface ToolCall {
  id?: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  id?: string;
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

export interface ProviderRunOpts {
  system: string;
  messages: ProviderMessage[];
  tools: { name: string; description: string; input_schema: object }[];
  maxTokens: number;
  signal?: AbortSignal;
}

export interface ProviderStepResult {
  content: string;
  tool_calls: ToolCall[];
  tokens_in: number;
  tokens_out: number;
}

export interface PlanProvider {
  id: string;
  displayName: string;
  /** Model id, for per-run logs. */
  model?: string;
  supportsVision: boolean;
  run(opts: ProviderRunOpts): Promise<ProviderStepResult>;
}

export interface FixtureResult {
  changes: PlanChange[];
  checks: PlanCheck[];
}
