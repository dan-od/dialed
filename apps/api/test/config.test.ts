import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const base = {
  DATABASE_URL: 'postgres://x@127.0.0.1/x',
  JWT_PRIVATE_KEY_FILE: '/dev/null',
  CODE_PEPPER: 'a'.repeat(64),
};

describe('PLAN_TEMPERATURE (homelab: claude-sonnet-5-5 rejects temperature)', () => {
  it('is unset by default and when empty, so no temperature is sent', () => {
    expect(loadConfig(base).PLAN_TEMPERATURE).toBeUndefined();
    expect(loadConfig({ ...base, PLAN_TEMPERATURE: '' }).PLAN_TEMPERATURE).toBeUndefined();
    expect(loadConfig({ ...base, PLAN_TEMPERATURE: '  ' }).PLAN_TEMPERATURE).toBeUndefined();
  });
  it('parses a set value, including 0', () => {
    expect(loadConfig({ ...base, PLAN_TEMPERATURE: '0' }).PLAN_TEMPERATURE).toBe(0);
    expect(loadConfig({ ...base, PLAN_TEMPERATURE: '0.2' }).PLAN_TEMPERATURE).toBe(0.2);
    expect(() => loadConfig({ ...base, PLAN_TEMPERATURE: '3' })).toThrow(/PLAN_TEMPERATURE/);
  });
});
