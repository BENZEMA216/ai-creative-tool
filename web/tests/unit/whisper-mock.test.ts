import { describe, it, expect, beforeEach } from 'vitest';

describe('MockWhisperClient', () => {
  it('returns canned text', async () => {
    const { MockWhisperClient } = await import('@/lib/clients/whisper/mock');
    const client = new MockWhisperClient();
    const result = await client.transcribe('/tmp/x.mp3');
    expect(result.text).toContain('mock');
    expect(result.language).toBeTruthy();
  });
});

describe('Whisper factory', () => {
  beforeEach(async () => {
    const mod = await import('@/lib/clients/whisper');
    mod._resetWhisperClient();
  });

  it('returns mock for WHISPER_MODE=mock', async () => {
    process.env.WHISPER_MODE = 'mock';
    const mod = await import('@/lib/clients/whisper');
    const c = mod.getWhisperClient();
    expect(c.constructor.name).toBe('MockWhisperClient');
  });

  it('returns openai for WHISPER_MODE=openai', async () => {
    process.env.WHISPER_MODE = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    const mod = await import('@/lib/clients/whisper');
    mod._resetWhisperClient();
    const c = mod.getWhisperClient();
    expect(c.constructor.name).toBe('OpenAIWhisperClient');
  });
});
