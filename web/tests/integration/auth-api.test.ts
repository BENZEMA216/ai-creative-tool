import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

import { redis } from '@/lib/redis';
import { POST as sendCode } from '@/app/api/auth/send-code/route';
import { testPrisma, resetDb } from '../helpers/test-db';

beforeEach(async () => {
  process.env.MOCK_SMS = 'true';
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  await (redis as any).flushall();
  await resetDb();
});

function makeReq(body: unknown) {
  return new Request('http://localhost/api/auth/send-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/send-code', () => {
  it('sends a code and persists to DB', async () => {
    const res = await sendCode(makeReq({ phone: '13800138000' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.expire_in).toBe(300);

    const code = await testPrisma.smsCode.findFirst({ where: { phone: '13800138000' } });
    expect(code).toBeTruthy();
    expect(code!.code).toMatch(/^\d{6}$/);
    expect(code!.used).toBe(false);
  });

  it('rejects invalid phone', async () => {
    const res = await sendCode(makeReq({ phone: '12300000000' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rate-limits within 60 seconds (1 per phone)', async () => {
    const r1 = await sendCode(makeReq({ phone: '13800138000' }));
    expect((await r1.json()).code).toBe(0);
    const r2 = await sendCode(makeReq({ phone: '13800138000' }));
    expect((await r2.json()).code).not.toBe(0);
  });
});

import { POST as login } from '@/app/api/auth/login/route';

function loginReq(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function seedCode(phone: string, code: string) {
  await testPrisma.smsCode.create({
    data: { phone, code, purpose: 'login', expiredAt: new Date(Date.now() + 300_000) },
  });
}

describe('POST /api/auth/login', () => {
  it('auto-registers a new phone and returns is_new_user=true', async () => {
    await seedCode('13900139000', '654321');
    const res = await login(loginReq({ phone: '13900139000', code: '654321' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.is_new_user).toBe(true);
    expect(json.data.user_id).toMatch(/^AC\d{8}$/);
    expect(json.data.token).toBeTruthy();
    expect(res.headers.get('set-cookie')).toContain('auth-token=');

    const user = await testPrisma.user.findUnique({ where: { phone: '13900139000' } });
    expect(user).toBeTruthy();
    expect(user!.points).toBe(0);
  });

  it('logs in existing user without creating duplicate', async () => {
    await testPrisma.user.create({
      data: { userId: 'AC00000001', phone: '13900139000', points: 100 },
    });
    await seedCode('13900139000', '111111');

    const res = await login(loginReq({ phone: '13900139000', code: '111111' }));
    const json = await res.json();
    expect(json.data.is_new_user).toBe(false);
    expect(json.data.user_id).toBe('AC00000001');
    expect(json.data.points).toBe(100);

    const count = await testPrisma.user.count({ where: { phone: '13900139000' } });
    expect(count).toBe(1);
  });

  it('rejects wrong code', async () => {
    await seedCode('13900139000', '111111');
    const res = await login(loginReq({ phone: '13900139000', code: '999999' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rejects expired code', async () => {
    await testPrisma.smsCode.create({
      data: { phone: '13900139000', code: '111111', purpose: 'login', expiredAt: new Date(Date.now() - 1000) },
    });
    const res = await login(loginReq({ phone: '13900139000', code: '111111' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rejects already-used code', async () => {
    await testPrisma.smsCode.create({
      data: { phone: '13900139000', code: '111111', purpose: 'login', expiredAt: new Date(Date.now() + 60000), used: true },
    });
    const res = await login(loginReq({ phone: '13900139000', code: '111111' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rejects banned user', async () => {
    await testPrisma.user.create({
      data: { userId: 'AC00000002', phone: '13700137000', points: 0, status: 'banned' },
    });
    await seedCode('13700137000', '222222');
    const res = await login(loginReq({ phone: '13700137000', code: '222222' }));
    const json = await res.json();
    expect(json.code).toBe(1003);
  });
});
