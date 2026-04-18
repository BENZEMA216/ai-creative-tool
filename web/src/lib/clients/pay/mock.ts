import type { PayClient, CreateOrderInput, CreateOrderResult, VerifiedCallback } from './interface';

export class MockPayClient implements PayClient {
  async createNativeOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    setTimeout(() => {
      fetch(input.notifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mock-pay': 'true' },
        body: JSON.stringify({ order_no: input.orderNo, success: true }),
      }).catch(() => {});
    }, 5000);

    return {
      qrCodeUrl: `mock://qr/${input.orderNo}`,
      prepayId: `mock-prepay-${input.orderNo.slice(-8)}`,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  verifyCallback(_headers: Record<string, string | undefined>, body: unknown): VerifiedCallback {
    const b = (body ?? {}) as { order_no?: string; success?: boolean };
    return { orderNo: b.order_no ?? '', success: b.success ?? false };
  }
}
