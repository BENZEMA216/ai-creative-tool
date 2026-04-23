import type { PayClient, CreateOrderInput, CreateOrderResult, VerifiedCallback, QueryOrderResult } from './interface';

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
  async verifyCallback(_headers: Record<string, string | undefined>, body: unknown): Promise<VerifiedCallback> {
    const b = (body ?? {}) as { order_no?: string; success?: boolean };
    return { orderNo: b.order_no ?? '', success: b.success ?? false };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async queryOrder(_orderNo: string): Promise<QueryOrderResult> {
    // Mock mode uses auto-callback path; query is no-op
    return { paid: false };
  }
}
