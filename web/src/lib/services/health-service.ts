import { prisma } from '@/lib/db/prisma';
import { redis } from '@/lib/redis';

export interface HealthCheck {
  ok: boolean;
  checks: {
    database: { ok: boolean; latency_ms: number; error?: string };
    redis: { ok: boolean; latency_ms: number; error?: string };
  };
}

async function time<T>(fn: () => Promise<T>): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, latency_ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function checkHealth(): Promise<HealthCheck> {
  const [database, redisCheck] = await Promise.all([
    time(() => prisma.$queryRaw`SELECT 1`),
    time(() => redis.ping()),
  ]);
  return {
    ok: database.ok && redisCheck.ok,
    checks: { database, redis: redisCheck },
  };
}
