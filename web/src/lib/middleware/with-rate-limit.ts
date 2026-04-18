import { rateLimit } from '@/lib/core/rate-limit';
import { err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';

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
