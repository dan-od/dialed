import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isPrivateIp, SsrfError } from '../src/providers/http';

vi.mock('../src/providers/http', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/providers/http')>();
  return { ...orig, safeFetch: vi.fn() };
});

const loadRecording = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'recordings', `${name}.json`), 'utf8'));

beforeEach(() => { vi.restoreAllMocks(); });

async function mockSafeFetch(recording: { status: number; body: object }) {
  const { safeFetch } = await import('../src/providers/http');
  vi.mocked(safeFetch).mockResolvedValueOnce({
    status: recording.status,
    headers: {},
    body: JSON.stringify(recording.body),
  });
}

describe('isPrivateIp', () => {
  it.each([
    '127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '169.254.0.1', '0.0.0.0', '::1', 'fc00::1', 'fd12::1', 'fe80::1',
  ])('blocks %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8', '1.1.1.1', '172.32.0.1', '192.169.0.1', '2607:f8b0:4004:800::200e',
  ])('allows %s', (ip) => {
    expect(isPrivateIp(ip)).toBe(false);
  });
});

describe('safeFetch SSRF', () => {
  it('rejects http:// URLs', async () => {
    const { safeFetch: realSafeFetch } = await vi.importActual<typeof import('../src/providers/http')>('../src/providers/http');
    await expect(realSafeFetch({ url: 'http://example.com' })).rejects.toThrow('only HTTPS');
  });

  it('rejects private IP in URL', async () => {
    const { safeFetch: realSafeFetch } = await vi.importActual<typeof import('../src/providers/http')>('../src/providers/http');
    await expect(realSafeFetch({ url: 'https://127.0.0.1/test' })).rejects.toThrow('private IP');
  });

  it('allows private IP when allowPrivate is set', async () => {
    const { safeFetch: realSafeFetch } = await vi.importActual<typeof import('../src/providers/http')>('../src/providers/http');
    // This will fail on connection (no server), NOT on SSRF check
    await expect(realSafeFetch({ url: 'https://127.0.0.1/test', allowPrivate: true, timeoutMs: 500 }))
      .rejects.not.toThrow(SsrfError);
  });
});

describe('provider contract: Anthropic', () => {
  it('parses a propose_changes tool call', async () => {
    const recording = loadRecording('anthropic-propose');
    await mockSafeFetch(recording);

    const { createAnthropicProvider } = await import('../src/providers/anthropic');
    const provider = createAnthropicProvider({ apiKey: 'test', model: 'test' });

    const result = await provider.run({
      system: 'test',
      messages: [{ role: 'user', content: 'Add gym on Monday' }],
      tools: [{ name: 'propose_changes', description: 'test', input_schema: {} }],
      maxTokens: 1024,
    });

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0]!.name).toBe('propose_changes');
    const input = result.tool_calls[0]!.input as { changes: unknown[] };
    expect(input.changes).toHaveLength(1);
    expect(result.tokens_in).toBe(120);
    expect(result.tokens_out).toBe(60);
  });

  it('throws provider_key_invalid on 401', async () => {
    const { safeFetch } = await import('../src/providers/http');
    vi.mocked(safeFetch).mockResolvedValueOnce({
      status: 401, headers: {}, body: '{"error":{"type":"authentication_error"}}',
    });
    const { createAnthropicProvider } = await import('../src/providers/anthropic');
    const provider = createAnthropicProvider({ apiKey: 'bad', model: 'test' });
    await expect(provider.run({
      system: '', messages: [{ role: 'user', content: 'test' }], tools: [], maxTokens: 16,
    })).rejects.toThrow('provider_key_invalid');
  });

  it('throws provider_error on 500', async () => {
    const { safeFetch } = await import('../src/providers/http');
    vi.mocked(safeFetch).mockResolvedValueOnce({
      status: 500, headers: {}, body: '{"error":"internal"}',
    });
    const { createAnthropicProvider } = await import('../src/providers/anthropic');
    const provider = createAnthropicProvider({ apiKey: 'test', model: 'test' });
    await expect(provider.run({
      system: '', messages: [{ role: 'user', content: 'test' }], tools: [], maxTokens: 16,
    })).rejects.toThrow('provider_error');
  });
});

describe('provider contract: OpenAI', () => {
  it('parses a propose_changes tool call', async () => {
    const recording = loadRecording('openai-propose');
    await mockSafeFetch(recording);

    const { createOpenAIProvider } = await import('../src/providers/openai');
    const provider = createOpenAIProvider({ apiKey: 'test', model: 'test' });

    const result = await provider.run({
      system: 'test',
      messages: [{ role: 'user', content: 'Add gym on Monday' }],
      tools: [{ name: 'propose_changes', description: 'test', input_schema: {} }],
      maxTokens: 1024,
    });

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0]!.name).toBe('propose_changes');
    expect(result.tokens_in).toBe(150);
    expect(result.tokens_out).toBe(80);
  });

  it('throws provider_key_invalid on 403', async () => {
    const { safeFetch } = await import('../src/providers/http');
    vi.mocked(safeFetch).mockResolvedValueOnce({
      status: 403, headers: {}, body: '{"error":{"message":"forbidden"}}',
    });
    const { createOpenAIProvider } = await import('../src/providers/openai');
    const provider = createOpenAIProvider({ apiKey: 'bad', model: 'test' });
    await expect(provider.run({
      system: '', messages: [{ role: 'user', content: 'test' }], tools: [], maxTokens: 16,
    })).rejects.toThrow('provider_key_invalid');
  });
});

describe('provider contract: Gemini', () => {
  it('parses a propose_changes tool call', async () => {
    const recording = loadRecording('gemini-propose');
    await mockSafeFetch(recording);

    const { createGeminiProvider } = await import('../src/providers/gemini');
    const provider = createGeminiProvider({ apiKey: 'test', model: 'test' });

    const result = await provider.run({
      system: 'test',
      messages: [{ role: 'user', content: 'Add gym on Monday' }],
      tools: [{ name: 'propose_changes', description: 'test', input_schema: {} }],
      maxTokens: 1024,
    });

    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0]!.name).toBe('propose_changes');
    expect(result.tokens_in).toBe(130);
    expect(result.tokens_out).toBe(70);
  });
});
