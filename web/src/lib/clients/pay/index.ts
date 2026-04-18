import type { PayClient } from './interface';
import { MockPayClient } from './mock';
import { WechatPayClient } from './wechat';

export type { PayClient, CreateOrderInput, CreateOrderResult, VerifiedCallback } from './interface';

let cached: PayClient | undefined;

export function getPayClient(): PayClient {
  if (cached) return cached;
  cached = process.env.MOCK_PAY === 'true' ? new MockPayClient() : new WechatPayClient();
  return cached;
}

export function _resetPayClient(): void {
  cached = undefined;
}
