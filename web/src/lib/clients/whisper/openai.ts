import { createReadStream } from 'node:fs';
import OpenAI from 'openai';
import type { WhisperClient, TranscribeResult } from './interface';
import { AppError, ErrCode } from '@/lib/domain/errors';

export class OpenAIWhisperClient implements WhisperClient {
  private client: OpenAI;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new AppError(ErrCode.WhisperFailed, 'OPENAI_API_KEY 未配置');
    this.client = new OpenAI({ apiKey: key });
  }

  async transcribe(audioPath: string): Promise<TranscribeResult> {
    try {
      const result = await this.client.audio.transcriptions.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        file: createReadStream(audioPath) as any,
        model: 'whisper-1',
        response_format: 'verbose_json',
      });
      return {
        text: result.text,
        language: (result as { language?: string }).language ?? 'unknown',
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new AppError(ErrCode.WhisperFailed, `OpenAI Whisper 失败: ${msg}`);
    }
  }
}
