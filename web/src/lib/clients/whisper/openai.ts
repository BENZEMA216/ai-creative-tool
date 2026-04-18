import { createReadStream } from 'node:fs';
import OpenAI from 'openai';
import type { WhisperClient, TranscribeResult } from './interface';
import { AppError, ErrCode } from '@/lib/core/errors';

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
        file: createReadStream(audioPath) as any,
        model: 'whisper-1',
        response_format: 'verbose_json',
      });
      return {
        text: result.text,
        language: (result as any).language ?? 'unknown',
      };
    } catch (e: any) {
      throw new AppError(ErrCode.WhisperFailed, `OpenAI Whisper 失败: ${e.message}`);
    }
  }
}
