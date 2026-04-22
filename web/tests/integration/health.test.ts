import { describe, it, expect, vi } from 'vitest';
import RedisMock from 'ioredis-mock';
vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns ok: true with both db + redis latencies when healthy', async () => {
    const res = await GET();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.checks.database.ok).toBe(true);
    expect(json.checks.database.latency_ms).toBeGreaterThanOrEqual(0);
    expect(json.checks.redis.ok).toBe(true);
    expect(res.status).toBe(200);
  });
});
