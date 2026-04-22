import { describe, it, expect, beforeEach, vi } from 'vitest';

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

import { testPrisma, resetDb } from '../helpers/test-db';
import { extractText, parseVideo } from '@/lib/services/video-service';
import { AppError, ErrCode } from '@/lib/domain/errors';

beforeEach(async () => {
  process.env.WHISPER_MODE = 'mock';
  process.env.INTERNAL_API_TOKEN = 'test-secret-32-chars-12345678901234567890';
  await resetDb();
  mockExtract.mockReset();
  mockParse.mockReset();
});

async function makeUser(points: number) {
  return testPrisma.user.create({
    data: { userId: 'AC10000001', phone: '13800138000', points },
  });
}

describe('VideoService.extractText', () => {
  it('success → deducts 10 + returns result', async () => {
    const u = await makeUser(100);
    mockExtract.mockResolvedValue({
      title: 'T', duration: 60, thumbnail: 'x', audio_path: '/tmp/a.mp3',
    });

    const result = await extractText(u.id, 'https://www.youtube.com/watch?v=x');

    expect(result.points_consumed).toBe(10);
    expect(result.points_remaining).toBe(90);
    expect(result.platform).toBe('youtube');
    expect(result.duration_text).toBe('01:00');

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(90);
  });

  it('unsupported platform throws UnsupportedPlatform', async () => {
    const u = await makeUser(100);
    await expect(extractText(u.id, 'https://example.com/x')).rejects.toMatchObject({
      code: ErrCode.UnsupportedPlatform,
    });
  });

  it('insufficient points throws PointsInsufficient (no ytdlp call)', async () => {
    const u = await makeUser(5);
    await expect(extractText(u.id, 'https://www.youtube.com/watch?v=x')).rejects.toMatchObject({
      code: ErrCode.PointsInsufficient,
    });
    expect(mockExtract).not.toHaveBeenCalled();

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(5);
  });

  it('video > 30 min throws VideoTooLong + records failed usage', async () => {
    const u = await makeUser(100);
    mockExtract.mockResolvedValue({
      title: 'L', duration: 2000, thumbnail: '', audio_path: '/tmp/a.mp3',
    });
    await expect(extractText(u.id, 'https://www.youtube.com/watch?v=x')).rejects.toMatchObject({
      code: ErrCode.VideoTooLong,
    });

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(100);

    const ur = await testPrisma.usageRecord.findFirst({ where: { userId: u.id, status: 'failed' } });
    expect(ur).toBeTruthy();
  });

  it('ytdlp failure → VideoParseFailed + no deduction', async () => {
    const u = await makeUser(100);
    mockExtract.mockRejectedValue(new Error('network error'));
    await expect(extractText(u.id, 'https://www.youtube.com/watch?v=x')).rejects.toMatchObject({
      code: ErrCode.VideoParseFailed,
    });
    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(100);
  });
});

describe('VideoService.parseVideo', () => {
  it('success → deducts 20 + returns download_url', async () => {
    const u = await makeUser(100);
    mockParse.mockResolvedValue({
      title: 'V', duration: 120, thumbnail: 'http://x/t.jpg', download_token: 'tok', ext: 'mp4',
    });

    const result = await parseVideo(u.id, 'https://www.bilibili.com/video/BV1xx411c7mD');

    expect(result.points_consumed).toBe(20);
    expect(result.points_remaining).toBe(80);
    expect(result.platform).toBe('bilibili');
    expect(result.download_url).toContain('tok');
  });

  it('unsupported platform throws UnsupportedPlatform', async () => {
    const u = await makeUser(100);
    await expect(parseVideo(u.id, 'https://example.com/x')).rejects.toMatchObject({
      code: ErrCode.UnsupportedPlatform,
    });
  });

  it('insufficient points throws PointsInsufficient', async () => {
    const u = await makeUser(10);
    await expect(parseVideo(u.id, 'https://www.youtube.com/watch?v=x')).rejects.toMatchObject({
      code: ErrCode.PointsInsufficient,
    });
  });
});
