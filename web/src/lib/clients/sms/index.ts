import type { SmsClient } from './interface';
import { MockSmsClient } from './mock';
import { TencentSmsClient } from './tencent';

export type { SmsClient, SmsPurpose } from './interface';

let cached: SmsClient | undefined;

export function getSmsClient(): SmsClient {
  if (cached) return cached;
  cached = process.env.MOCK_SMS === 'true' ? new MockSmsClient() : new TencentSmsClient();
  return cached;
}

// 测试用：重置 factory 缓存
export function _resetSmsClient(): void {
  cached = undefined;
}
