import { describe, it, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  // Reset all env for each test
  delete process.env.WECHAT_PAY_APP_ID;
  delete process.env.WECHAT_PAY_MCH_ID;
  delete process.env.WECHAT_PAY_API_V3_KEY;
  delete process.env.WECHAT_PAY_SERIAL_NO;
  delete process.env.WECHAT_PAY_CERT_PATH;
  delete process.env.WECHAT_PAY_KEY_PATH;
  vi.resetModules();
});

describe('WechatPayClient — config validation', () => {
  it('throws with clear message if any required env missing', async () => {
    const { WechatPayClient } = await import('@/lib/clients/pay/wechat');
    expect(() => new WechatPayClient()).toThrow(/WECHAT_PAY_APP_ID/);
  });

  it('throws if cert file path does not exist', async () => {
    process.env.WECHAT_PAY_APP_ID = 'wxtest';
    process.env.WECHAT_PAY_MCH_ID = '1234567890';
    process.env.WECHAT_PAY_API_V3_KEY = 'a'.repeat(32);
    process.env.WECHAT_PAY_SERIAL_NO = 'x'.repeat(40);
    process.env.WECHAT_PAY_CERT_PATH = '/nonexistent/cert.pem';
    process.env.WECHAT_PAY_KEY_PATH = '/nonexistent/key.pem';

    const { WechatPayClient } = await import('@/lib/clients/pay/wechat');
    expect(() => new WechatPayClient()).toThrow(/证书文件不存在/);
  });
});
