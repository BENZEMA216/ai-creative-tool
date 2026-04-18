import { YtdlpHttpClient } from './http-client';

let cached: YtdlpHttpClient | undefined;

export function getYtdlpClient(): YtdlpHttpClient {
  if (cached) return cached;
  cached = new YtdlpHttpClient();
  return cached;
}

export function _resetYtdlpClient(): void {
  cached = undefined;
}

export type { ExtractAudioResult, ParseVideoResult } from './http-client';
