import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

const mockExtract = vi.fn();
const mockParse = vi.fn();
vi.mock('@/lib/clients/ytdlp', () => ({
  getYtdlpClient: () => ({
    extractAudio: mockExtract,
    parseVideo: mockParse,
    buildDownloadUrl: (t: string) => `http://ytdlp/download/${t}`,
  }),
  _resetYtdlpClient: () => {},
}));

import { redis } from '@/lib/redis';
import { POST as extractText } from '@/app/api/video/extract-text/route';
import { POST as parseVideo } from '@/app/api/video/parse/route';
import { testPrisma, resetDb } from '../helpers/test-db';
import { signUserToken } from '@/lib/core/auth';

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  process.env.WHISPER_MODE = 'mock';
  process.env.INTERNAL_API_TOKEN = 'test-secret-32-chars-12345678901234567890';
  await (redis as any).flushall();
  await resetDb();
  mockExtract.mockReset();
  mockParse.mockReset();
});

async function makeUserAndToken(points: number) {
  const user = await testPrisma.user.create({
    data: { userId: 'AC10000001', phone: '13800138000', points },
  });
  const token = await signUserToken({ uid: user.id, userId: user.userId });
  return { user, token };
}

function makeReq(body: unknown, token: string) {
  return new Request('http://localhost/api/video/extract-text', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `auth-token=${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/video/extract-text', () => {
  it('extracts text + deducts 10 points + creates success usage record', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockExtract.mockResolvedValue({
      title: 'Test',
      duration: 60,
      thumbnail: 'http://x/t.jpg',
      audio_path: '/tmp/x.mp3',
    });

    const res = await extractText(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.text).toContain('mock');
    expect(json.data.duration).toBe(60);
    expect(json.data.points_consumed).toBe(10);
    expect(json.data.points_remaining).toBe(90);

    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(90);

    const ur = await testPrisma.usageRecord.findFirst({ where: { userId: user.id } });
    expect(ur!.status).toBe('success');
    expect(ur!.type).toBe('extract_text');
    expect(ur!.platform).toBe('youtube');
  });

  it('rejects unsupported platform', async () => {
    const { token } = await makeUserAndToken(100);
    const res = await extractText(makeReq({ video_url: 'https://example.com/vid' }, token));
    const json = await res.json();
    expect(json.code).toBe(2001);
  });

  it('rejects when points insufficient', async () => {
    const { user, token } = await makeUserAndToken(5);
    const res = await extractText(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    const json = await res.json();
    expect(json.code).toBe(2010);
    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(5);
  });

  it('rejects video > 30min and does not deduct', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockExtract.mockResolvedValue({
      title: 'Long', duration: 2000, thumbnail: '', audio_path: '/tmp/x.mp3',
    });
    const res = await extractText(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    const json = await res.json();
    expect(json.code).toBe(2002);
    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(100);
    const ur = await testPrisma.usageRecord.findFirst({ where: { userId: user.id, status: 'failed' } });
    expect(ur).toBeTruthy();
  });

  it('rejects when ytdlp fails and does not deduct', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockExtract.mockRejectedValue(new Error('ytdlp boom'));
    const res = await extractText(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    const json = await res.json();
    expect(json.code).not.toBe(0);
    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(100);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/video/extract-text', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ video_url: 'https://x' }),
    });
    const res = await extractText(req as any);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/video/parse', () => {
  it('parses + deducts 20 points + returns download_url', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockParse.mockResolvedValue({
      title: 'V', duration: 120, thumbnail: 'http://x/t.jpg',
      download_token: 'fake-token', ext: 'mp4',
    });

    const req = new Request('http://localhost/api/video/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `auth-token=${token}` },
      body: JSON.stringify({ video_url: 'https://www.bilibili.com/video/BV1xx411c7mD' }),
    });
    const res = await parseVideo(req);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.points_consumed).toBe(20);
    expect(json.data.points_remaining).toBe(80);
    expect(json.data.download_url).toContain('fake-token');
    expect(json.data.platform).toBe('bilibili');

    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(80);
  });

  it('rejects unsupported platform', async () => {
    const { token } = await makeUserAndToken(100);
    const req = new Request('http://localhost/api/video/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `auth-token=${token}` },
      body: JSON.stringify({ video_url: 'https://example.com/vid' }),
    });
    const res = await parseVideo(req);
    expect((await res.json()).code).toBe(2001);
  });

  it('does not deduct when ytdlp fails', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockParse.mockRejectedValue(new Error('parse boom'));
    const req = new Request('http://localhost/api/video/parse', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `auth-token=${token}` },
      body: JSON.stringify({ video_url: 'https://www.youtube.com/watch?v=x' }),
    });
    const res = await parseVideo(req);
    expect((await res.json()).code).not.toBe(0);
    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(100);
  });
});
