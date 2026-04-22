import { AppError, ErrCode } from '@/lib/domain/errors';

export interface ExtractAudioResult {
  title: string;
  duration: number;
  thumbnail: string;
  audio_path: string;
}

export interface ParseVideoResult {
  title: string;
  duration: number;
  thumbnail: string;
  download_token: string;
  ext: string;
}

export class YtdlpHttpClient {
  private baseUrl: string;
  private internalToken: string;

  constructor() {
    this.baseUrl = process.env.YTDLP_SERVICE_URL ?? 'http://localhost:8000';
    const token = process.env.INTERNAL_API_TOKEN;
    if (!token) throw new Error('INTERNAL_API_TOKEN must be set');
    this.internalToken = token;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': this.internalToken,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail: string;
      try {
        const j = await res.json();
        detail = j.detail ?? res.statusText;
      } catch {
        detail = await res.text();
      }
      throw new AppError(ErrCode.YtdlpFailed, `ytdlp-service ${path} 失败 (${res.status}): ${detail}`);
    }
    return await res.json() as T;
  }

  async extractAudio(url: string): Promise<ExtractAudioResult> {
    return this.post<ExtractAudioResult>('/extract-audio', { url });
  }

  async parseVideo(url: string): Promise<ParseVideoResult> {
    return this.post<ParseVideoResult>('/parse-video', { url });
  }

  buildDownloadUrl(token: string): string {
    return `${this.baseUrl}/download/${token}`;
  }
}
