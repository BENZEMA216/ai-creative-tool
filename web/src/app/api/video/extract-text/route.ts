import { z } from 'zod';
import { promises as fs } from 'node:fs';
import { withAuth } from '@/lib/middleware/with-auth';
import { checkUserRateLimit } from '@/lib/middleware/with-rate-limit';
import { ok, err } from '@/lib/core/http';
import { ErrCode, AppError } from '@/lib/core/errors';
import { resolvePlatform } from '@/lib/core/platform';
import { consumePoints, recordFailedUsage, PointsInsufficientError } from '@/lib/core/points';
import { getYtdlpClient } from '@/lib/clients/ytdlp';
import { getWhisperClient } from '@/lib/clients/whisper';
import { prisma } from '@/lib/db/prisma';

const POINTS = 10;
const MAX_DURATION = 1800; // 30 min

const reqSchema = z.object({ video_url: z.string().url() });

export async function POST(req: Request) {
  return withAuth(req, async (request, user) => {
    const rl = await checkUserRateLimit(user.uid, 'extract-text', 10, 60);
    if (rl) return rl;

    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, '请求参数非法');
    const { video_url } = parsed.data;

    const platform = resolvePlatform(video_url);
    if (!platform) return err(ErrCode.UnsupportedPlatform, '不支持的视频平台');

    // 快查余额
    const u = await prisma.user.findUnique({ where: { id: user.uid }, select: { points: true } });
    if (!u || u.points < POINTS) {
      return err(ErrCode.PointsInsufficient, `积分不足，当前 ${u?.points ?? 0} / 需要 ${POINTS}`);
    }

    let extractResult;
    try {
      extractResult = await getYtdlpClient().extractAudio(video_url);
    } catch (e) {
      const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : '视频解析失败');
      await recordFailedUsage({ userId: user.uid, type: 'extract_text', videoUrl: video_url, platform, errorMessage: msg });
      return err(ErrCode.VideoParseFailed, msg);
    }

    if (extractResult.duration > MAX_DURATION) {
      await recordFailedUsage({ userId: user.uid, type: 'extract_text', videoUrl: video_url, platform, errorMessage: `视频时长 ${extractResult.duration}s 超过 ${MAX_DURATION}s` });
      fs.unlink(extractResult.audio_path).catch(() => {});
      return err(ErrCode.VideoTooLong, `视频时长超出限制（最大 30 分钟）`);
    }

    let transcribed;
    try {
      transcribed = await getWhisperClient().transcribe(extractResult.audio_path);
    } catch (e) {
      const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : 'Whisper 转写失败');
      await recordFailedUsage({ userId: user.uid, type: 'extract_text', videoUrl: video_url, platform, errorMessage: msg });
      fs.unlink(extractResult.audio_path).catch(() => {});
      return err(ErrCode.WhisperFailed, msg);
    }

    let consumeResult;
    try {
      consumeResult = await consumePoints({
        userId: user.uid,
        amount: POINTS,
        description: '文案提取',
        usageRecord: {
          type: 'extract_text',
          videoUrl: video_url,
          platform,
          resultText: transcribed.text,
          videoDuration: extractResult.duration,
        },
      });
    } catch (e) {
      if (e instanceof PointsInsufficientError) {
        return err(ErrCode.PointsInsufficient, e.message);
      }
      throw e;
    } finally {
      fs.unlink(extractResult.audio_path).catch(() => {});
    }

    const minutes = Math.floor(extractResult.duration / 60).toString().padStart(2, '0');
    const seconds = (extractResult.duration % 60).toString().padStart(2, '0');

    return ok({
      title: extractResult.title,
      platform,
      duration: extractResult.duration,
      duration_text: `${minutes}:${seconds}`,
      text: transcribed.text,
      points_consumed: POINTS,
      points_remaining: consumeResult.balanceAfter,
    }, '文案提取成功');
  });
}
