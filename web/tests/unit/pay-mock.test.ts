import { describe, it, expect, beforeEach } from 'vitest';

describe('MockPayClient', () => {
  it('returns a fake QR code URL', async () => {
    const { MockPayClient } = await import('@/lib/clients/pay/mock');
    const client = new MockPayClient();
    const result = await client.createNativeOrder({
      orderNo: 'AC20260418123456ABCD',
      amountYuan: 39.9,
      description: 'standard',
      notifyUrl: 'http://localhost/api/order/wechat-callback',
    });
    expect(result.qrCodeUrl).toContain('mock');
    expect(result.prepayId).toBeTruthy();
  });

  it('verifyCallback returns success for any well-formed body', async () => {
    const { MockPayClient } = await import('@/lib/clients/pay/mock');
    const client = new MockPayClient();
    const r = await client.verifyCallback({}, { order_no: 'AC20260418123456ABCD', success: true });
    expect(r.orderNo).toBe('AC20260418123456ABCD');
    expect(r.success).toBe(true);
  });
});

describe('Pay factory', () => {
  beforeEach(async () => {
    const mod = await import('@/lib/clients/pay');
    mod._resetPayClient();
  });

  it('returns mock when MOCK_PAY=true', async () => {
    process.env.MOCK_PAY = 'true';
    const mod = await import('@/lib/clients/pay');
    mod._resetPayClient();
    const c = mod.getPayClient();
    expect(c.constructor.name).toBe('MockPayClient');
  });
});
