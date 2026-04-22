import { describe, it, expect } from 'vitest';
import { ErrCode, AppError } from '@/lib/domain/errors';
import { ok, err } from '@/lib/http/response';

describe('AppError', () => {
  it('carries code and message', () => {
    const e = new AppError(ErrCode.PointsInsufficient, '积分不足');
    expect(e.code).toBe(ErrCode.PointsInsufficient);
    expect(e.message).toBe('积分不足');
  });
});

describe('ok()', () => {
  it('produces { code: 0, message, data } shape', async () => {
    const res = ok({ hello: 'world' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ code: 0, message: 'success', data: { hello: 'world' } });
  });
});

describe('err()', () => {
  it('produces { code, message, data: null } shape', async () => {
    const res = err(ErrCode.PointsInsufficient, '积分不足');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ code: 2010, message: '积分不足', data: null });
  });

  it('returns 500 status for system errors (9xxx)', async () => {
    const res = err(ErrCode.InternalError, 'oops');
    expect(res.status).toBe(500);
  });

  it('returns 401 for auth errors (1001-1003)', async () => {
    const res = err(ErrCode.Unauthorized, 'no token');
    expect(res.status).toBe(401);
  });
});
