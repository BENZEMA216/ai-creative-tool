import type { SmsClient, SmsPurpose } from './interface';

export class MockSmsClient implements SmsClient {
  async sendCode(phone: string, code: string, purpose: SmsPurpose): Promise<void> {
    // 故意打到 stdout，方便 docker logs web 中肉眼读取
    console.log(`[MOCK SMS] phone=${phone} code=${code} purpose=${purpose}`);
  }
}
