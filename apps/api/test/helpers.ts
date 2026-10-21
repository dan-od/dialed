import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { buildApp } from '../src/app';
import type { Config } from '../src/config';
import { createDb } from '../src/db/pool';
import { MemoryTransport } from '../src/email';
import { testDatabaseUrl } from './globalSetup';

export const OWNER = { id: 'c5610ac2-5ae9-57cd-9cd6-a9e11adb97a6', email: 'owner@dialed.test' };
export const ALICE = { id: 'e521209e-061e-5e83-a3ac-c88cbafa97a9', email: 'alice@dialed.test' };
export const BOB = { id: 'dcd51125-4b4c-518e-a8f2-efb63aeca63c', email: 'bob@dialed.test' };
export const BOB_PROBE_BLOCK = '96f203c4-23c4-5601-a29d-e5a23c342087';
export const DEV_PASSWORD = 'dialed-dev-password';

export function testConfig(over: Partial<Config> = {}): Config {
  const { privateKey } = generateKeyPairSync('ed25519');
  return {
    NODE_ENV: 'test',
    APP_NAME: 'Dialed',
    PUBLIC_BASE_URL: 'http://localhost:8080',
    PORT: 0,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    SIGNUP_MODE: 'open',
    APPLE_TEAM_TIER: 'personal',
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? testDatabaseUrl(),
    JWT_PRIVATE_KEY_FILE: '(memory)',
    JWT_KEY_ID: 'test-1',
    CODE_PEPPER: randomBytes(32).toString('hex'),
    EMAIL_TRANSPORT: 'console',
    EMAIL_FROM: 'Dialed <no-reply@okoro.me>',
    APNS_MODE: 'log',
    AI_MODE: 'fixture',
    MCP_ENABLED: false,
    TRUST_PROXY_IP: undefined,
    RATE_LIMIT_MULTIPLIER: 100,
    jwtPrivateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ...over,
  };
}

export async function makeApp(
  over: Partial<Config> = {},
  logStream?: { write(line: string): void },
) {
  const config = testConfig(over);
  const { pool, db } = createDb(config.DATABASE_URL);
  const email = new MemoryTransport();
  const app = await buildApp(config, { pool, db, email, logStream });
  await app.ready();
  return {
    app,
    pool,
    db,
    email,
    config,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

export const uniqueEmail = (tag = 'p') => `${tag}-${randomBytes(4).toString('hex')}@dialed.test`;

export type TestApp = Awaited<ReturnType<typeof makeApp>>;

export async function login(t: TestApp, email: string, password = DEV_PASSWORD) {
  const r = await t.app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    payload: { email, password },
  });
  if (r.statusCode !== 200) throw new Error(`login ${email} → ${r.statusCode} ${r.body}`);
  return r.json() as { access_token: string; refresh_token: string; user: { id: string } };
}
