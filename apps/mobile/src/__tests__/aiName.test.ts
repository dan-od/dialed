import { aiName, setAiConfig } from '../config';

describe('aiName()', () => {
  afterEach(() => setAiConfig('server', 'anthropic'));

  it('defaults to Claude', () => {
    expect(aiName()).toBe('Claude');
  });

  it('returns ChatGPT for openai', () => {
    setAiConfig('own', 'openai');
    expect(aiName()).toBe('ChatGPT');
  });

  it('returns Gemini for gemini', () => {
    setAiConfig('own', 'gemini');
    expect(aiName()).toBe('Gemini');
  });

  it('returns the custom model name for compatible', () => {
    setAiConfig('own', 'compatible', 'llama-3.1-70b');
    expect(aiName()).toBe('llama-3.1-70b');
  });

  it('returns AI when compatible has no custom model', () => {
    setAiConfig('own', 'compatible');
    expect(aiName()).toBe('AI');
  });
});
