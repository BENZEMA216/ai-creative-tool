import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => {
  return { redis: new RedisMock() };
});

import { redis } from '@/lib/redis';
import { rateLimit } from '@/lib/infra/rate-limit';

describe('rateLimit', () => {
  beforeEach(async () => {
    await (redis as any).flushall();
  });

  it('allows up to limit', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await rateLimit('k1', 5, 60);
      expect(ok).toBe(true);
    }
  });

  it('blocks once over limit', async () => {
    for (let i = 0; i < 5; i++) await rateLimit('k2', 5, 60);
    expect(await rateLimit('k2', 5, 60)).toBe(false);
  });

  it('isolates by key', async () => {
    for (let i = 0; i < 5; i++) await rateLimit('k3', 5, 60);
    expect(await rateLimit('k4', 5, 60)).toBe(true);
  });
});
