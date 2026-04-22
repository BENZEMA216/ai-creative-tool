import type { PayClient, CreateOrderInput, CreateOrderResult, VerifiedCallback } from './interface';
import { AppError, ErrCode } from '@/lib/domain/errors';

export class WechatPayClient implements PayClient {
  constructor() {
    const required = ['WECHAT_PAY_APP_ID', 'WECHAT_PAY_MCH_ID', 'WECHAT_PAY_API_KEY', 'WECHAT_PAY_NOTIFY_URL'];
    for (const k of required) {
      if (!process.env[k]) {
        throw new AppError(ErrCode.WechatPayCreateFailed, `${k} 未配置；请改用 MOCK_PAY=true 或填入凭证`);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createNativeOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new AppError(
      ErrCode.WechatPayCreateFailed,
      '微信支付 V3 Native 客户端未完整实现；请填证书 + 接入 wechatpay-node-v3 SDK 后再切真实模式。当前请用 MOCK_PAY=true。'
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verifyCallback(_headers: Record<string, string | undefined>, _body: unknown): VerifiedCallback {
    throw new AppError(ErrCode.WechatPayCreateFailed, '微信回调验签未实现');
  }
}
