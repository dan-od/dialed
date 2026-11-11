import {
  createFixtureProvider,
  createAnthropicProvider,
  createOpenAIProvider,
  createGeminiProvider,
  createCompatProvider,
  type PlanProvider,
} from '@dialed/planning';
import type { Config } from '../config';
import { AppError } from '../lib/errors';

export interface ProviderOpts {
  config: Config;
  providerMode: 'server' | 'byo';
  provider?: string;
  byoKey?: string;
  byoBaseUrl?: string;
  requestText: string;
}

export function createPlanProvider(opts: ProviderOpts): PlanProvider {
  if (opts.config.AI_MODE === 'fixture') {
    return createFixtureProvider(opts.requestText);
  }

  if (opts.providerMode === 'server') {
    const apiKey = opts.config.ANTHROPIC_API_KEY;
    if (!apiKey) throw new AppError('server_error', 'Server AI key is not configured.');
    return createAnthropicProvider({
      apiKey,
      model: opts.config.PLAN_MODEL_ANTHROPIC,
    });
  }

  // BYO mode
  if (!opts.byoKey) {
    throw new AppError('byo_key_required', 'Bring-your-own key is required for this plan.');
  }

  const provider = opts.provider ?? 'anthropic';
  switch (provider) {
    case 'anthropic':
      return createAnthropicProvider({
        apiKey: opts.byoKey,
        model: opts.config.PLAN_MODEL_ANTHROPIC,
      });
    case 'openai':
      return createOpenAIProvider({
        apiKey: opts.byoKey,
        model: opts.config.PLAN_MODEL_OPENAI,
      });
    case 'gemini':
      return createGeminiProvider({
        apiKey: opts.byoKey,
        model: opts.config.PLAN_MODEL_GEMINI,
      });
    case 'custom':
      if (!opts.byoBaseUrl) {
        throw new AppError('bad_request', 'Custom provider needs a base URL.');
      }
      return createCompatProvider({
        apiKey: opts.byoKey,
        model: opts.config.PLAN_MODEL_OPENAI,
        baseUrl: opts.byoBaseUrl,
        allowPrivate: opts.config.ALLOW_PRIVATE_PROVIDER_URLS,
      });
    default:
      throw new AppError('bad_request', `Unknown provider: ${provider}`);
  }
}
