import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

import { redis } from '@/lib/redis';
import { testPrisma, resetDb } from '../helpers/test-db';
import { sendSmsCode, loginWithCode, getUserProfile, anonLogin } from '@/lib/services/user-service';
import { ErrCode } from '@/lib/domain/errors';

beforeEach(async () => {
  process.env.MOCK_SMS = 'true';
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  await (redis as any).flushall();
  await resetDb();
});

describe('UserService.sendSmsCode', () => {
  it('saves code to DB', async () => {
    const result = await sendSmsCode('13800138000');
    expect(result.expire_in).toBe(300);
    const row = await testPrisma.smsCode.findFirst({ where: { phone: '13800138000' } });
    expect(row!.code).toMatch(/^\d{6}$/);
  });

  it('rate-limits same phone within 60s', async () => {
    await sendSmsCode('13800138000');
    await expect(sendSmsCode('13800138000')).rejects.toMatchObject({ code: ErrCode.SmsSendFailed });
  });
});

describe('UserService.loginWithCode', () => {
  it('auto-registers new phone', async () => {
    await testPrisma.smsCode.create({
      data: { phone: '13900139000', code: '123456', purpose: 'login', expiredAt: new Date(Date.now() + 300_000) },
    });
    const result = await loginWithCode('13900139000', '123456');
    expect(result.is_new_user).toBe(true);
    expect(result.user_id).toMatch(/^AC\d{8}$/);
    expect(result.token).toBeTruthy();
  });

  it('rejects bad code', async () => {
    await expect(loginWithCode('13900139000', '000000')).rejects.toMatchObject({ code: ErrCode.TokenInvalid });
  });

  it('rejects banned user', async () => {
    await testPrisma.user.create({
      data: { userId: 'AC00000002', phone: '13700137000', points: 0, status: 'banned' },
    });
    await testPrisma.smsCode.create({
      data: { phone: '13700137000', code: '222222', purpose: 'login', expiredAt: new Date(Date.now() + 300_000) },
    });
    await expect(loginWithCode('13700137000', '222222')).rejects.toMatchObject({ code: ErrCode.AccountBanned });
  });
});

describe('UserService.getUserProfile', () => {
  it('returns masked phone', async () => {
    const u = await testPrisma.user.create({
      data: { userId: 'AC11111111', phone: '13800138000', points: 50 },
    });
    const result = await getUserProfile(u.id);
    expect(result.phone).toBe('138****8000');
    expect(result.points).toBe(50);
  });

  it('throws Unauthorized for missing user', async () => {
    await expect(getUserProfile('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      code: ErrCode.Unauthorized,
    });
  });
});

describe('UserService.anonLogin', () => {
  it('creates new user with unique userId + starter points', async () => {
    const r1 = await anonLogin();
    const r2 = await anonLogin();
    expect(r1.userId).not.toBe(r2.userId);
    const u = await testPrisma.user.findFirst({ where: { userId: r1.userId } });
    expect(u!.points).toBeGreaterThan(0);
  });
});
