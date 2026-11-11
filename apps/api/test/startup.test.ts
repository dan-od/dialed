// Startup validation (api and worker both call loadConfig): misconfigured prod refuses to start with a clear error.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config';
import { findAssetRoot } from '../src/lib/assets';
import { SmtpTransport, createEmailTransport } from '../src/email';

const base = {
  DATABASE_URL: 'postgres://x@127.0.0.1/x',
  JWT_PRIVATE_KEY_FILE: '/dev/null',
  CODE_PEPPER: 'a'.repeat(64),
};
const prod = {
  ...base,
  NODE_ENV: 'production',
  EMAIL_TRANSPORT: 'smtp',
  SMTP_URL: 'smtps://user:pass@smtp.example.com:465',
  AI_MODE: 'live',
  ANTHROPIC_API_KEY: 'sk-ant-test',
};

describe('startup validation', () => {
  it('starts with a complete production env', () => {
    const c = loadConfig(prod);
    expect(c.EMAIL_TRANSPORT).toBe('smtp');
    expect(c.AI_MODE).toBe('live');
  });

  it('refuses AI_MODE=live without ANTHROPIC_API_KEY', () => {
    expect(() => loadConfig({ ...prod, ANTHROPIC_API_KEY: '' })).toThrow(
      'AI_MODE=live needs ANTHROPIC_API_KEY',
    );
    expect(() => loadConfig({ ...base, AI_MODE: 'live' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('refuses EMAIL_TRANSPORT=smtp without SMTP_URL in production', () => {
    expect(() => loadConfig({ ...prod, SMTP_URL: '' })).toThrow(
      'EMAIL_TRANSPORT=smtp needs SMTP_URL in production',
    );
  });

  it('refuses an SMTP_URL that is not smtp:// or smtps://', () => {
    expect(() => loadConfig({ ...prod, SMTP_URL: 'https://smtp.example.com' })).toThrow(/SMTP_URL/);
  });

  it('treats blank keys (as in a filled-in .env.example) as unset', () => {
    const c = loadConfig({
      ...base,
      PLAN_MAX_TOKENS: '',
      TRUST_PROXY_IP: '',
      ALLOW_PRIVATE_PROVIDER_URLS: '',
    });
    expect(c.PLAN_MAX_TOKENS).toBe(8192);
    expect(c.TRUST_PROXY_IP).toBeUndefined();
  });

  it('defaults the Anthropic planning model to claude-sonnet-5-5', () => {
    expect(loadConfig(base).PLAN_MODEL_ANTHROPIC).toBe('claude-sonnet-5-5');
  });

  it('builds an SMTP transport from SMTP_URL', () => {
    const t = createEmailTransport(loadConfig(prod));
    expect(t).toBeInstanceOf(SmtpTransport);
  });
});

describe('planning guide location', () => {
  const repo = resolve(import.meta.dirname, '../../..');
  it('finds the repo root from source and from the bundle folder', () => {
    expect(findAssetRoot(resolve(repo, 'apps/api/src/plans'))).toBe(repo);
    expect(findAssetRoot(resolve(repo, 'apps/api/dist'))).toBe(repo);
  });
  it('finds the image layout (/app/dist next to /app/mcp)', () => {
    const app = mkdtempSync(join(tmpdir(), 'dialed-app-'));
    mkdirSync(join(app, 'dist'));
    mkdirSync(join(app, 'mcp'));
    writeFileSync(join(app, 'mcp', 'planning-guide.md'), '# guide');
    expect(findAssetRoot(join(app, 'dist'))).toBe(app);
  });
  it('refuses to guess when the guide is missing', () => {
    const empty = mkdtempSync(join(tmpdir(), 'dialed-none-'));
    expect(() => findAssetRoot(empty)).toThrow(/planning-guide/);
  });
});
