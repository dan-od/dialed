// scripts/homelab-init: writes .env and the JWT key once, with production values, and never overwrites.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { describe, it, expect, beforeAll } from 'vitest';
import { loadConfig } from '../src/config';

const ROOT = resolve(import.meta.dirname, '../../..');
let dir: string;
let env: Record<string, string>;
const run = () =>
  execFileSync('bash', [join(dir, 'scripts/homelab-init')], { cwd: dir, stdio: 'pipe' }).toString();

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'dialed-init-'));
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(join(ROOT, 'scripts/homelab-init'), join(dir, 'scripts/homelab-init'));
  copyFileSync(join(ROOT, '.env.example'), join(dir, '.env.example'));
  run();
  env = parseEnv(readFileSync(join(dir, '.env'), 'utf8')) as Record<string, string>;
});

describe('homelab-init', () => {
  it('writes .env and the key with mode 0600', () => {
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, '.secrets/jwt-ed25519.pem')).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(dir, '.secrets/jwt-ed25519.pem'), 'utf8')).toMatch(
      /BEGIN PRIVATE KEY/,
    );
  });

  it('sets the production values', () => {
    expect(env).toMatchObject({
      COMPOSE_FILE: 'infra/docker-compose.yml',
      COMPOSE_PROFILES: 'prod',
      NODE_ENV: 'production',
      PUBLIC_BASE_URL: 'https://dialed.okoro.me',
      PORT: '8080',
      SIGNUP_MODE: 'invite',
      APPLE_TEAM_TIER: 'personal',
      EMAIL_TRANSPORT: 'smtp',
      APNS_MODE: 'log',
      AI_MODE: 'live',
      PLAN_MODEL_ANTHROPIC: 'claude-sonnet-5-5',
      MCP_ENABLED: 'true',
      TRUST_PROXY_IP: '172.16.0.0/12',
      LOG_LEVEL: 'info',
      APP_NAME: 'Dialed',
    });
    expect(env.POSTGRES_PASSWORD).toMatch(/^[0-9a-f]{48}$/);
    expect(env.CODE_PEPPER).toMatch(/^[0-9a-f]{64}$/);
    expect(env.ADMIN_TOKEN).toMatch(/^[0-9a-f]{64}$/);
    expect(env.JWT_KEY_ID).toMatch(/^ed25519-[0-9a-f]{16}$/);
  });

  it('leaves the owner TODOs blank and marked', () => {
    const text = readFileSync(join(dir, '.env'), 'utf8');
    for (const k of ['SMTP_URL', 'EMAIL_FROM', 'BACKUP_DIR', 'ANTHROPIC_API_KEY']) {
      expect(env[k] ?? '').toBe('');
      expect(text).toMatch(new RegExp(`# TODO\\(owner\\): .*\\n${k}=\\n`));
    }
    expect(text).not.toMatch(/CLOUDFLARE_TUNNEL_TOKEN/);
  });

  it('never puts a comment after KEY= (compose env_file reads `KEY=  # hint` as the value "# hint")', () => {
    const text = readFileSync(join(dir, '.env'), 'utf8');
    expect(
      text.split('\n').filter((l) => /^[A-Z][A-Z0-9_]*=.*#/.test(l) && !/^EMAIL_FROM=/.test(l)),
    ).toEqual([]);
  });

  it('refuses to start until the TODOs are filled, then loads as production', () => {
    const asRun = {
      ...env,
      DATABASE_URL: 'postgres://x@db/x',
      JWT_PRIVATE_KEY_FILE: join(dir, '.secrets/jwt-ed25519.pem'),
    };
    expect(() => loadConfig(asRun)).toThrow(/SMTP_URL|ANTHROPIC_API_KEY/);
    const c = loadConfig({
      ...asRun,
      SMTP_URL: 'smtps://u:p@smtp.example.com:465',
      ANTHROPIC_API_KEY: 'sk-ant-x',
    });
    expect(c.NODE_ENV).toBe('production');
    expect(c.TRUST_PROXY_IP).toBe('172.16.0.0/12');
  });

  it('never overwrites: a second run changes nothing', () => {
    const before = [
      readFileSync(join(dir, '.env'), 'utf8'),
      readFileSync(join(dir, '.secrets/jwt-ed25519.pem'), 'utf8'),
    ];
    run();
    const after = [
      readFileSync(join(dir, '.env'), 'utf8'),
      readFileSync(join(dir, '.secrets/jwt-ed25519.pem'), 'utf8'),
    ];
    expect(after).toEqual(before);
  });
});
