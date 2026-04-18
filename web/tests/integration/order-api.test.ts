import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

import { redis } from '@/lib/redis';
import { POST as createOrder } from '@/app/api/order/create/route';
import { testPrisma, resetDb } from '../helpers/test-db';
import { signUserToken } from '@/lib/core/auth';

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
