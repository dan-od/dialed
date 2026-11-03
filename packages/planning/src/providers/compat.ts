import { createOpenAIProvider, type OpenAIProviderOpts } from './openai';
import type { PlanProvider } from './types';

export function createCompatProvider(opts: OpenAIProviderOpts & { baseUrl: string }): PlanProvider {
  const provider = createOpenAIProvider(opts);
  return { ...provider, id: 'custom', displayName: 'Custom' };
}
