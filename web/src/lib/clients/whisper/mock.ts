import type { WhisperClient, TranscribeResult } from './interface';

export class MockWhisperClient implements WhisperClient {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async transcribe(_audioPath: string): Promise<TranscribeResult> {
    return {
      text: '这是一段 mock 转写文本。在 WHISPER_MODE=openai 或 local 时会替换为真实结果。本段文字仅用于本地开发与测试。',
      language: 'zh',
    };
  }
}
