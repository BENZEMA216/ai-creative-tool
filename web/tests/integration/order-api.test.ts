import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

import { redis } from '@/lib/redis';
import { POST as createOrder } from '@/app/api/order/create/route';
import { GET as getStatus } from '@/app/api/order/status/[id]/route';
import { POST as wechatCallback } from '@/app/api/order/wechat-callback/route';
import { testPrisma, resetDb } from '../helpers/test-db';
import { signUserToken } from '@/lib/security/jwt';

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  process.env.MOCK_PAY = 'true';
  process.env.WECHAT_PAY_NOTIFY_URL = 'http://localhost:3000/api/order/wechat-callback';
  await (redis as any).flushall();
  await resetDb();
});

async function makeUserAndToken() {
  const user = await testPrisma.user.create({
    data: { userId: 'AC10000001', phone: '13800138000', points: 0 },
  });
  const token = await signUserToken({ uid: user.id, userId: user.userId });
  return { user, token };
}

function makeReq(body: unknown, token: string) {
  return new Request('http://localhost/api/order/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `auth-token=${token}` },
    body: JSON.stringify(body),
  });
}

describe('POST /api/order/create', () => {
  it('creates a pending order with QR code URL', async () => {
    const { user, token } = await makeUserAndToken();
    const res = await createOrder(makeReq({ package_type: 'standard' }, token));
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.order_no).toMatch(/^AC\d{14}[A-Z0-9]{4}$/);
    expect(json.data.amount).toBe(39.9);
    expect(json.data.points).toBe(5000);
    expect(json.data.qr_code_url).toContain('mock');

    const order = await testPrisma.order.findUnique({ where: { orderNo: json.data.order_no } });
    expect(order).toBeTruthy();
    expect(order!.userId).toBe(user.id);
    expect(order!.status).toBe('pending');
    expect(order!.packageType).toBe('standard');
    expect(Number(order!.amountYuan)).toBe(39.9);
  });

  it('rejects invalid package type', async () => {
    const { token } = await makeUserAndToken();
    const res = await createOrder(makeReq({ package_type: 'foo' }, token));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/order/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ package_type: 'basic' }),
    });
    const res = await createOrder(req as any);
    expect(res.status).toBe(401);
  });
});

async function makeOrder(userId: string, status: 'pending' | 'paid' | 'expired') {
  return testPrisma.order.create({
    data: {
      orderNo: status === 'pending' ? 'AC20260418123456PEND' : status === 'paid' ? 'AC20260418123456PAID' : 'AC20260418123456EXPI',
      userId,
      packageType: 'standard',
      amountYuan: 39.9,
      points: 5000,
      status,
    },
  });
}

describe('GET /api/order/status/:id', () => {
  it('returns order status to its owner', async () => {
    const { user, token } = await makeUserAndToken();
    const order = await makeOrder(user.id, 'pending');
    const req = new Request(`http://localhost/api/order/status/${order.orderNo}`, {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await getStatus(req as any, { params: { id: order.orderNo } });
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.status).toBe('pending');
    expect(json.data.order_no).toBe(order.orderNo);
  });

  it('returns 404 for unknown order', async () => {
    const { token } = await makeUserAndToken();
    const req = new Request('http://localhost/api/order/status/AC00000000000000XXXX', {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await getStatus(req as any, { params: { id: 'AC00000000000000XXXX' } });
    const json = await res.json();
    expect(json.code).toBe(2020);
  });

  it('forbids access to other user orders', async () => {
    const owner = await testPrisma.user.create({
      data: { userId: 'AC22222222', phone: '13700137000', points: 0 },
    });
    const order = await makeOrder(owner.id, 'pending');

    const { token } = await makeUserAndToken();
    const req = new Request(`http://localhost/api/order/status/${order.orderNo}`, {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await getStatus(req as any, { params: { id: order.orderNo } });
    const json = await res.json();
    expect(json.code).toBe(2020);
  });
});

describe('POST /api/order/wechat-callback', () => {
  it('marks order paid + adds points + records transaction (idempotent)', async () => {
    const { user } = await makeUserAndToken();
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456CALL',
        userId: user.id,
        packageType: 'standard',
        amountYuan: 39.9,
        points: 5000,
        status: 'pending',
      },
    });

    const req = new Request('http://localhost/api/order/wechat-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: order.orderNo, success: true }),
    });
    const res = await wechatCallback(req as any);
    expect(res.status).toBe(200);

    const updated = await testPrisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('paid');
    expect(updated!.paidAt).toBeTruthy();

    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(5000);

    const tx = await testPrisma.pointTransaction.findFirst({ where: { userId: user.id } });
    expect(tx!.amount).toBe(5000);
    expect(tx!.type).toBe('recharge');
    expect(tx!.relatedOrderId).toBe(order.orderNo);

    // Idempotent: second callback doesn't double-add
    const req2 = new Request('http://localhost/api/order/wechat-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: order.orderNo, success: true }),
    });
    const res2 = await wechatCallback(req2 as any);
    expect(res2.status).toBe(200);
    const finalUser = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(finalUser!.points).toBe(5000);
  });

  it('ignores callback for unknown order', async () => {
    const req = new Request('http://localhost/api/order/wechat-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: 'AC00000000000000XXXX', success: true }),
    });
    const res = await wechatCallback(req as any);
    expect(res.status).toBe(200);
  });

  it('marks order failed if success=false', async () => {
    const { user } = await makeUserAndToken();
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456FAIL',
        userId: user.id,
        packageType: 'basic',
        amountYuan: 19.9,
        points: 2000,
        status: 'pending',
      },
    });
    const req = new Request('http://localhost/api/order/wechat-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: order.orderNo, success: false }),
    });
    await wechatCallback(req as any);

    const updated = await testPrisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('failed');
    const u = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(u!.points).toBe(0);
  });
});
