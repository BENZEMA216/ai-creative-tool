import { describe, it, expect, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { AppError, ErrCode } from '@/lib/domain/errors';

describe('withErrorBoundary', () => {
  it('passes through successful response', async () => {
    const h = withErrorBoundary()(async () => NextResponse.json({ ok: true }));
    const res = await h(new Request('http://x'));
    expect(await res.json()).toEqual({ ok: true });
  });

  it('catches AppError → returns its code + message', async () => {
    const h = withErrorBoundary()(async () => { throw new AppError(ErrCode.PointsInsufficient, '积分不足'); });
    const res = await h(new Request('http://x'));
    const json = await res.json();
    expect(json.code).toBe(2010);
    expect(json.message).toBe('积分不足');
  });

  it('catches generic Error → 9000', async () => {
    const h = withErrorBoundary()(async () => { throw new Error('boom'); });
    const res = await h(new Request('http://x'));
    const json = await res.json();
    expect(json.code).toBe(9000);
    expect(res.status).toBe(500);
  });

  it('catches unknown throw → 9000 with generic message', async () => {
    const h = withErrorBoundary()(async () => { throw 'weird'; });
    const res = await h(new Request('http://x'));
    const json = await res.json();
    expect(json.code).toBe(9000);
    expect(json.message).toBe('服务器内部错误');
  });

  it('calls onError hook before formatting response', async () => {
    const onError = vi.fn(async () => {});
    const h = withErrorBoundary({ onError })(async () => { throw new AppError(ErrCode.VideoParseFailed, 'fail'); });
    await h(new Request('http://x'));
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][1]).toBeInstanceOf(AppError);
  });
});
