import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { parseProxySpec } from './lib/proxy';

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
  /** smtp(s)://user:pass@host:port, e.g. Resend SMTP. Required with EMAIL_TRANSPORT=smtp in production. */
  SMTP_URL: z
    .string()
    .refine((v) => /^smtps?:\/\/[^\s]+$/.test(v), 'SMTP_URL must start with smtp:// or smtps://')
    .optional(),
  EMAIL_FROM: z.string().default('Dialed <no-reply@okoro.me>'),
  APNS_MODE: z.enum(['log', 'apns']).default('log'),
  /** App bundle ID; Live Activity pushes go to <topic>.push-type.liveactivity. */
  APNS_TOPIC: z.string().default('me.okoro.dialed'),
  AI_MODE: z.enum(['fixture', 'live']).default('fixture'),
  MCP_ENABLED: bool.default(false),
  /** nginx-proxy's address: an exact IP or a CIDR such as 172.16.0.0/12 (the Docker networks). */
  TRUST_PROXY_IP: z
    .string()
    .refine((v) => parseProxySpec(v) !== null, 'TRUST_PROXY_IP must be an IP or CIDR')
    .optional(),
  RATE_LIMIT_MULTIPLIER: z.coerce.number().min(1).default(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  PLAN_MODEL_ANTHROPIC: z.string().default('claude-sonnet-5-5'),
  PLAN_MODEL_OPENAI: z.string().default('gpt-4o'),
  PLAN_MODEL_GEMINI: z.string().default('gemini-2.5-flash'),
  PLAN_MAX_TOKENS: z.coerce.number().int().min(256).default(8192),
  /** Sampling temperature for plan runs. Unset or empty: none is sent (some models, e.g. claude-sonnet-5-5, reject it). */
  PLAN_TEMPERATURE: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.coerce.number().min(0).max(1).optional(),
  ),
  PLAN_DAILY_LIMIT: z.coerce.number().int().min(1).default(30),
  ALLOW_PRIVATE_PROVIDER_URLS: bool.default(false),
  UPLOAD_DIR: z.string().default('/tmp/dialed-uploads'),
  IMPORT_DAILY_LIMIT: z.coerce.number().int().min(1).default(6),
});

export type Config = z.infer<typeof Env> & { jwtPrivateKeyPem: string };

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // A blank key (KEY= in a filled-in .env.example) means unset, so defaults and optionals apply.
  const present = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const parsed = Env.safeParse(present);
  if (!parsed.success) {
    // Names only — never echo values.
    const keys = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment: ${keys}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && c.EMAIL_TRANSPORT === 'console') {
    throw new Error('EMAIL_TRANSPORT=console is not allowed in production');
  }
  if (c.NODE_ENV === 'production' && c.EMAIL_TRANSPORT === 'smtp' && !c.SMTP_URL) {
    throw new Error('EMAIL_TRANSPORT=smtp needs SMTP_URL in production');
  }
  if (c.AI_MODE === 'live' && !c.ANTHROPIC_API_KEY) {
    throw new Error('AI_MODE=live needs ANTHROPIC_API_KEY');
  }
  if (c.APNS_MODE === 'apns') {
    throw new Error('APNS_MODE=apns is not activated yet; use log');
  }
  return { ...c, jwtPrivateKeyPem: readFileSync(c.JWT_PRIVATE_KEY_FILE, 'utf8') };
}
