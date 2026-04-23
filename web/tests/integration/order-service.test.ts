import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testPrisma, resetDb } from '../helpers/test-db';
import { createOrder, getOrderStatus, handleWechatCallback } from '@/lib/services/order-service';
import { ErrCode } from '@/lib/domain/errors';

beforeEach(async () => {
  process.env.MOCK_PAY = 'true';
  process.env.WECHAT_PAY_NOTIFY_URL = 'http://localhost:3000/api/order/wechat-callback';
  await resetDb();
});

async function makeUser(points = 0) {
  return testPrisma.user.create({
    data: { userId: 'AC10000001', phone: '13800138000', points },
  });
}

describe('OrderService.createOrder', () => {
  it('creates pending order with mock qr URL', async () => {
    const u = await makeUser();
    const result = await createOrder(u.id, 'standard');
    expect(result.amount).toBe(39.9);
    expect(result.points).toBe(5000);
    expect(result.qr_code_url).toContain('mock');
    expect(result.order_no).toMatch(/^AC\d{14}[A-Z0-9]{4}$/);

    const order = await testPrisma.order.findUnique({ where: { orderNo: result.order_no } });
    expect(order!.status).toBe('pending');
    expect(order!.userId).toBe(u.id);
  });

  it('rejects invalid package_type', async () => {
    const u = await makeUser();
    await expect(createOrder(u.id, 'invalid')).rejects.toMatchObject({
      code: ErrCode.InternalError,
    });
  });
});

describe('OrderService.getOrderStatus', () => {
  it('returns status for owner', async () => {
    const u = await makeUser();
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456PEND', userId: u.id,
        packageType: 'basic', amountYuan: 19.9, points: 2000, status: 'pending',
      },
    });
    const result = await getOrderStatus(u.id, order.orderNo);
    expect(result.status).toBe('pending');
  });

  it('auto-expires old pending orders', async () => {
    const u = await makeUser();
    const oldDate = new Date(Date.now() - 20 * 60 * 1000);  // 20 min ago (> 15 min expiry)
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456OLD1', userId: u.id,
        packageType: 'basic', amountYuan: 19.9, points: 2000, status: 'pending',
        createdAt: oldDate,
      },
    });
    const result = await getOrderStatus(u.id, order.orderNo);
    expect(result.status).toBe('expired');

    const updated = await testPrisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('expired');
  });

  it('rejects access to other user orders', async () => {
    const owner = await testPrisma.user.create({
      data: { userId: 'AC22222222', phone: '13700137000', points: 0 },
    });
    const other = await testPrisma.user.create({
      data: { userId: 'AC33333333', phone: '13600136000', points: 0 },
    });
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456OWNR', userId: owner.id,
        packageType: 'basic', amountYuan: 19.9, points: 2000, status: 'pending',
      },
    });
    await expect(getOrderStatus(other.id, order.orderNo)).rejects.toMatchObject({
      code: ErrCode.OrderInvalid,
    });
  });

  it('rejects unknown order', async () => {
    const u = await makeUser();
    await expect(getOrderStatus(u.id, 'AC00000000000000XXXX')).rejects.toMatchObject({
      code: ErrCode.OrderInvalid,
    });
  });
});

describe('OrderService.handleWechatCallback', () => {
  it('marks paid + adds points on success (idempotent)', async () => {
    const u = await makeUser();
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456CB01', userId: u.id,
        packageType: 'standard', amountYuan: 39.9, points: 5000, status: 'pending',
      },
    });

    await handleWechatCallback({
      headers: {},
      body: { order_no: order.orderNo, success: true },
    });

    const updated = await testPrisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('paid');

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(5000);

    // Idempotent
    await handleWechatCallback({
      headers: {},
      body: { order_no: order.orderNo, success: true },
    });
    const finalUser = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(finalUser!.points).toBe(5000);
  });

  it('marks failed on success=false (no points)', async () => {
    const u = await makeUser();
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456CB02', userId: u.id,
        packageType: 'basic', amountYuan: 19.9, points: 2000, status: 'pending',
      },
    });
    await handleWechatCallback({
      headers: {},
      body: { order_no: order.orderNo, success: false },
    });
    const updated = await testPrisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('failed');
    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(0);
  });

  it('silently ignores unknown orders', async () => {
    await expect(handleWechatCallback({
      headers: {},
      body: { order_no: 'AC00000000000000NOPE', success: true },
    })).resolves.toBeUndefined();
  });
});

describe('OrderService.getOrderStatus — WeChat polling', () => {
  const mockQuery = vi.fn();

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('syncs pending order to paid when WeChat query returns SUCCESS', async () => {
    // Spy on getPayClient to inject a mock with custom queryOrder
    const { getPayClient } = await import('@/lib/clients/pay');
    const orig = getPayClient();
    // Monkeypatch the queryOrder method on the mock client for this test
    (orig as unknown as { queryOrder: typeof mockQuery }).queryOrder = mockQuery;
    mockQuery.mockResolvedValue({ paid: true, trade_state: 'SUCCESS' });

    const u = await makeUser();
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260423000000POLL', userId: u.id,
        packageType: 'basic', amountYuan: 19.9, points: 2000, status: 'pending',
      },
    });

    const result = await getOrderStatus(u.id, order.orderNo);
    expect(result.status).toBe('paid');

    const updated = await testPrisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('paid');
    expect(updated!.paidAt).toBeTruthy();

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(2000);

    const tx = await testPrisma.pointTransaction.findFirst({ where: { userId: u.id } });
    expect(tx!.type).toBe('recharge');
    expect(tx!.amount).toBe(2000);
  });

  it('leaves pending when WeChat says NOTPAY', async () => {
    const { getPayClient } = await import('@/lib/clients/pay');
    const orig = getPayClient();
    (orig as unknown as { queryOrder: typeof mockQuery }).queryOrder = mockQuery;
    mockQuery.mockResolvedValue({ paid: false, trade_state: 'NOTPAY' });

    const u = await testPrisma.user.create({
      data: { userId: 'AC44444444', phone: '13444444444', points: 0 },
    });
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260423000000POL2', userId: u.id,
        packageType: 'basic', amountYuan: 19.9, points: 2000, status: 'pending',
      },
    });

    const result = await getOrderStatus(u.id, order.orderNo);
    expect(result.status).toBe('pending');

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(0);
  });

  it('tolerates query errors (silent)', async () => {
    const { getPayClient } = await import('@/lib/clients/pay');
    const orig = getPayClient();
    (orig as unknown as { queryOrder: typeof mockQuery }).queryOrder = mockQuery;
    mockQuery.mockRejectedValue(new Error('network error'));

    const u = await testPrisma.user.create({
      data: { userId: 'AC55555555', phone: '13555555555', points: 0 },
    });
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260423000000POL3', userId: u.id,
        packageType: 'basic', amountYuan: 19.9, points: 2000, status: 'pending',
      },
    });

    // Should not throw; returns pending
    const result = await getOrderStatus(u.id, order.orderNo);
    expect(result.status).toBe('pending');
  });
});
