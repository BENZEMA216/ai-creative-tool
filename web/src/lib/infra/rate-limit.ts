import { redis } from '@/lib/redis';

/**
 * 简单滑动窗口：INCR + EXPIRE。
 * 返回 true = 允许，false = 限流。
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const k = `ratelimit:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, windowSeconds);
  return count <= limit;
}
