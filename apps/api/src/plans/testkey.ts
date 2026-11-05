import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createAnthropicProvider,
  createOpenAIProvider,
  createGeminiProvider,
  createCompatProvider,
} from '@dialed/planning';
import { requireApp } from '../auth/guard';
import type { JwtService } from '../auth/jwt';
import type { AuthService } from '../auth/service';
import type { Config } from '../config';
import { parse } from '../lib/validate';
import { AppError } from '../lib/errors';

const TestKeyBody = z.strictObject({
  provider: z.enum(['anthropic', 'openai', 'gemini', 'custom']),
  api_key: z.string().min(1).max(500),
  model: z.string().min(1).max(100).optional(),
  base_url: z.url().optional(),
});

export function testKeyRoute(
  app: FastifyInstance,
  config: Config,
  jwt: JwtService,
  auth: AuthService,
) {
  const preHandler = requireApp(jwt, auth);

  app.post(
    '/v1/ai/test-key',
    {
      preHandler,
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const body = parse(TestKeyBody, req.body);

      const provider = buildProvider(body, config);

      try {
        const result = await provider.run({
          system: 'Reply with exactly: ok',
          messages: [{ role: 'user', content: 'test' }],
          tools: [],
          maxTokens: 16,
        });
        return {
          ok: true,
          provider: body.provider,
          model: body.model ?? defaultModel(body.provider, config),
          tokens: result.tokens_in + result.tokens_out,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        if (msg === 'provider_key_invalid') throw new AppError('provider_key_invalid');
        throw new AppError(
          'provider_error',
          'Could not reach the provider. Check your key and try again.',
        );
      }
    },
  );
}

function buildProvider(body: z.infer<typeof TestKeyBody>, config: Config) {
  const model = body.model ?? defaultModel(body.provider, config);
  switch (body.provider) {
    case 'anthropic':
      return createAnthropicProvider({ apiKey: body.api_key, model });
    case 'openai':
      return createOpenAIProvider({ apiKey: body.api_key, model });
    case 'gemini':
      return createGeminiProvider({ apiKey: body.api_key, model });
    case 'custom':
      if (!body.base_url) throw new AppError('bad_request', 'Custom provider needs a base_url.');
      return createCompatProvider({
        apiKey: body.api_key,
        model,
        baseUrl: body.base_url,
        allowPrivate: config.ALLOW_PRIVATE_PROVIDER_URLS,
      });
  }
}

function defaultModel(provider: string, config: Config): string {
  switch (provider) {
    case 'anthropic':
      return config.PLAN_MODEL_ANTHROPIC;
    case 'openai':
      return config.PLAN_MODEL_OPENAI;
    case 'gemini':
      return config.PLAN_MODEL_GEMINI;
    default:
      return 'gpt-4o';
  }
}
