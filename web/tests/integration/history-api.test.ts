import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, resetDb } from '../helpers/test-db';
import { signUserToken } from '@/lib/security/jwt';
import { GET as historyList } from '@/app/api/history/list/route';

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  await resetDb();
});

describe('GET /api/history/list', () => {
  it('returns paginated history for authenticated user only', async () => {
    const me = await testPrisma.user.create({
      data: { userId: 'AC11111111', phone: '13800138000', points: 100 },
    });
    const other = await testPrisma.user.create({
      data: { userId: 'AC22222222', phone: '13700137000', points: 100 },
    });
    await testPrisma.usageRecord.createMany({
      data: [
        { userId: me.id, type: 'extract_text', videoUrl: 'a', platform: 'youtube', status: 'success', pointsConsumed: 10 },
        { userId: me.id, type: 'download_video', videoUrl: 'b', platform: 'douyin', status: 'success', pointsConsumed: 20 },
        { userId: other.id, type: 'extract_text', videoUrl: 'c', platform: 'youtube', status: 'success', pointsConsumed: 10 },
      ],
    });

    const token = await signUserToken({ uid: me.id, userId: me.userId });
    const req = new Request('http://localhost/api/history/list?page=1&page_size=10', {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await historyList(req as any);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.total).toBe(2);
  });

  it('filters by type', async () => {
    const me = await testPrisma.user.create({
      data: { userId: 'AC11111111', phone: '13800138000', points: 100 },
    });
    await testPrisma.usageRecord.createMany({
      data: [
        { userId: me.id, type: 'extract_text', videoUrl: 'a', platform: 'youtube', status: 'success', pointsConsumed: 10 },
        { userId: me.id, type: 'download_video', videoUrl: 'b', platform: 'douyin', status: 'success', pointsConsumed: 20 },
      ],
    });
    const token = await signUserToken({ uid: me.id, userId: me.userId });
    const req = new Request('http://localhost/api/history/list?type=extract_text', {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await historyList(req as any);
    expect((await res.json()).data.total).toBe(1);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/history/list');
    const res = await historyList(req as any);
    expect(res.status).toBe(401);
  });
});
