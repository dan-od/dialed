import { readFileSync } from 'node:fs';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Dialed'),
  PUBLIC_BASE_URL: z.url().default('http://localhost:8080'),
  PORT: z.coerce.number().int().default(8080),
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SIGNUP_MODE: z.enum(['invite', 'open']).default('invite'),
  APPLE_TEAM_TIER: z.enum(['personal', 'paid']).default('personal'),
  DATABASE_URL: z.string().min(1),
  JWT_PRIVATE_KEY_FILE: z.string().min(1),
  JWT_KEY_ID: z.string().min(1).default('dev-1'),
  CODE_PEPPER: z.string().regex(/^[0-9a-f]{64}$/, 'CODE_PEPPER must be 32 bytes hex'),
  EMAIL_TRANSPORT: z.enum(['console', 'smtp']).default('console'),
  EMAIL_FROM: z.string().default('Dialed <no-reply@okoro.me>'),
  APNS_MODE: z.enum(['log', 'apns']).default('log'),
  AI_MODE: z.enum(['fixture', 'live']).default('fixture'),
  MCP_ENABLED: bool.default(false),
  TRUST_PROXY_IP: z.string().optional(),
  RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).default(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  PLAN_MODEL_ANTHROPIC: z.string().default('claude-sonnet-4-20250514'),
  PLAN_MODEL_OPENAI: z.string().default('gpt-4o'),
  PLAN_MODEL_GEMINI: z.string().default('gemini-2.5-flash'),
  PLAN_MAX_TOKENS: z.coerce.number().int().min(256).default(8192),
  PLAN_DAILY_LIMIT: z.coerce.number().int().min(1).default(30),
  ALLOW_PRIVATE_PROVIDER_URLS: bool.default(false),
});

export type Config = z.infer<typeof Env> & { jwtPrivateKeyPem: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    // Names only — never echo values.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${keys}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && c.EMAIL_TRANSPORT === 'console') {
    throw new Error('EMAIL_TRANSPORT=console is not allowed in production');
  }
  if (c.EMAIL_TRANSPORT === 'smtp') {
    throw new Error(
      'EMAIL_TRANSPORT=smtp is not activated yet (BUILD_AGENT "Backend activation"); use console',
    );
  }
  if (c.APNS_MODE === 'apns') {
    throw new Error('APNS_MODE=apns is not activated yet; use log');
  }
  return { ...c, jwtPrivateKeyPem: readFileSync(c.JWT_PRIVATE_KEY_FILE, 'utf8') };
}
