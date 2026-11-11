import { describe, expect, it } from 'vitest';
import { testConfig } from './helpers';
import { createPlanProvider } from '../src/plans/provider-factory';

describe('createPlanProvider', () => {
  const fixtureConfig = testConfig({ AI_MODE: 'fixture' });
  const liveConfig = testConfig({ AI_MODE: 'live', ANTHROPIC_API_KEY: 'sk-test-key' });

  it('returns fixture provider in fixture mode regardless of provider_mode', () => {
    const p = createPlanProvider({
      config: fixtureConfig,
      providerMode: 'server',
      requestText: 'Add gym on Monday',
    });
    expect(p.id).toBe('fixture');
  });

  it('returns fixture for byo in fixture mode', () => {
    const p = createPlanProvider({
      config: fixtureConfig,
      providerMode: 'byo',
      provider: 'openai',
      byoKey: 'sk-byo',
      requestText: 'Add gym on Monday',
    });
    expect(p.id).toBe('fixture');
  });

  it('returns anthropic provider for server mode in live', () => {
    const p = createPlanProvider({
      config: liveConfig,
      providerMode: 'server',
      requestText: 'Add gym on Monday',
    });
    expect(p.id).toBe('anthropic');
    expect(p.displayName).toBeTruthy();
  });

  it('live server mode never returns fixture', () => {
    const p = createPlanProvider({
      config: liveConfig,
      providerMode: 'server',
      requestText: 'Add gym on Monday',
    });
    expect(p.id).not.toBe('fixture');
  });

  it('throws when server mode has no API key', () => {
    const noKeyConfig = testConfig({ AI_MODE: 'live', ANTHROPIC_API_KEY: undefined });
    expect(() =>
      createPlanProvider({
        config: noKeyConfig,
        providerMode: 'server',
        requestText: 'test',
      }),
    ).toThrow('Server AI key');
  });

  it('returns anthropic provider for byo anthropic in live', () => {
    const p = createPlanProvider({
      config: liveConfig,
      providerMode: 'byo',
      provider: 'anthropic',
      byoKey: 'sk-byo-ant',
      requestText: 'test',
    });
    expect(p.id).toBe('anthropic');
  });

  it('returns openai provider for byo openai in live', () => {
    const p = createPlanProvider({
      config: liveConfig,
      providerMode: 'byo',
      provider: 'openai',
      byoKey: 'sk-byo-oai',
      requestText: 'test',
    });
    expect(p.id).toBe('openai');
  });

  it('returns gemini provider for byo gemini in live', () => {
    const p = createPlanProvider({
      config: liveConfig,
      providerMode: 'byo',
      provider: 'gemini',
      byoKey: 'AIza-byo',
      requestText: 'test',
    });
    expect(p.id).toBe('gemini');
  });

  it('returns custom provider for byo custom with base_url in live', () => {
    const p = createPlanProvider({
      config: liveConfig,
      providerMode: 'byo',
      provider: 'custom',
      byoKey: 'sk-custom',
      byoBaseUrl: 'https://api.example.com',
      requestText: 'test',
    });
    expect(p.id).toBe('custom');
  });

  it('throws byo_key_required when byo mode has no key', () => {
    try {
      createPlanProvider({
        config: liveConfig,
        providerMode: 'byo',
        provider: 'anthropic',
        requestText: 'test',
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as { code: string }).code).toBe('byo_key_required');
    }
  });

  it('throws for custom provider without base_url', () => {
    expect(() =>
      createPlanProvider({
        config: liveConfig,
        providerMode: 'byo',
        provider: 'custom',
        byoKey: 'sk-custom',
        requestText: 'test',
      }),
    ).toThrow('base URL');
  });
});
