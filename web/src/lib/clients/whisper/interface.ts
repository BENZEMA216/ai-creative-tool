export interface TranscribeResult {
  text: string;
  language: string;
}

export interface WhisperClient {
  transcribe(audioPath: string): Promise<TranscribeResult>;
}
