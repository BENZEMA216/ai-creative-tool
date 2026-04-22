import { rateLimit } from '@/lib/infra/rate-limit';
import { err } from '@/lib/http/response';
import { ErrCode } from '@/lib/domain/errors';
import type { Handler, Middleware } from '@/lib/http/compose';
import { getAuthedUser } from './with-auth';

/**
 * 用户维度限流。必须在 requireAuth() 之后使用。
 */
export function userRateLimit(endpoint: string, limit = 10, windowSeconds = 60): Middleware {
  return (handler: Handler): Handler => async (req, ctx) => {
    const user = getAuthedUser(req);
    const ok = await rateLimit(`user:${user.uid}:${endpoint}`, limit, windowSeconds);
    if (!ok) return err(ErrCode.InternalError, '请求过于频繁，请稍后再试');
    return handler(req, ctx);
  };
}

// 向后兼容的旧接口
export async function checkUserRateLimit(
  userId: string,
  endpoint: string,
  limit = 10,
  windowSeconds = 60
): Promise<Response | null> {
  const ok = await rateLimit(`user:${userId}:${endpoint}`, limit, windowSeconds);
  if (!ok) return err(ErrCode.InternalError, '请求过于频繁，请稍后再试');
  return null;
}
