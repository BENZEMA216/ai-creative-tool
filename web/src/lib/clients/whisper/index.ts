import type { WhisperClient } from './interface';
import { MockWhisperClient } from './mock';
import { OpenAIWhisperClient } from './openai';
import { LocalWhisperClient } from './local';

export type { WhisperClient, TranscribeResult } from './interface';

let cached: WhisperClient | undefined;

export function getWhisperClient(): WhisperClient {
  if (cached) return cached;
  const mode = process.env.WHISPER_MODE ?? 'mock';
  switch (mode) {
    case 'openai':
      cached = new OpenAIWhisperClient();
      break;
    case 'local':
      cached = new LocalWhisperClient();
      break;
    default:
      cached = new MockWhisperClient();
  }
  return cached;
}

export function _resetWhisperClient(): void {
  cached = undefined;
}
