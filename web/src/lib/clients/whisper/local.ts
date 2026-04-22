import type { WhisperClient, TranscribeResult } from './interface';
import { AppError, ErrCode } from '@/lib/domain/errors';

export class LocalWhisperClient implements WhisperClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async transcribe(_audioPath: string): Promise<TranscribeResult> {
    throw new AppError(
      ErrCode.WhisperFailed,
      '本地 whisper.cpp 未实现；请改用 WHISPER_MODE=openai 或 mock'
    );
  }
}
