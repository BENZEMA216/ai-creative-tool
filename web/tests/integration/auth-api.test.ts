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
