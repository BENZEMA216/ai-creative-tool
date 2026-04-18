import { z } from 'zod';
import { withAuth } from '@/lib/middleware/with-auth';
import { checkUserRateLimit } from '@/lib/middleware/with-rate-limit';
import { ok, err } from '@/lib/core/http';
import { ErrCode, AppError } from '@/lib/core/errors';
import { resolvePlatform } from '@/lib/core/platform';
import { consumePoints, recordFailedUsage, PointsInsufficientError } from '@/lib/core/points';
import { getYtdlpClient } from '@/lib/clients/ytdlp';
import { prisma } from '@/lib/db/prisma';

const POINTS = 20;
const MAX_DURATION = 1800;

const reqSchema = z.object({ video_url: z.string().url() });

export async function POST(req: Request) {
  return withAuth(req, async (request, user) => {
    const rl = await checkUserRateLimit(user.uid, 'parse-video', 10, 60);
    if (rl) return rl;

    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, '请求参数非法');
    const { video_url } = parsed.data;

    const platform = resolvePlatform(video_url);
    if (!platform) return err(ErrCode.UnsupportedPlatform, '不支持的视频平台');

    const u = await prisma.user.findUnique({ where: { id: user.uid }, select: { points: true } });
    if (!u || u.points < POINTS) {
      return err(ErrCode.PointsInsufficient, `积分不足，当前 ${u?.points ?? 0} / 需要 ${POINTS}`);
    }

    let parseResult;
    try {
      parseResult = await getYtdlpClient().parseVideo(video_url);
    } catch (e) {
      const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : '视频解析失败');
      await recordFailedUsage({ userId: user.uid, type: 'download_video', videoUrl: video_url, platform, errorMessage: msg });
      return err(ErrCode.VideoParseFailed, msg);
    }

    if (parseResult.duration > MAX_DURATION) {
      await recordFailedUsage({ userId: user.uid, type: 'download_video', videoUrl: video_url, platform, errorMessage: `时长 ${parseResult.duration}s 超出` });
      return err(ErrCode.VideoTooLong, '视频时长超出限制');
    }

    const downloadUrl = getYtdlpClient().buildDownloadUrl(parseResult.download_token);

    let consumeResult;
    try {
      consumeResult = await consumePoints({
        userId: user.uid,
        amount: POINTS,
        description: '视频下载解析',
        usageRecord: {
          type: 'download_video',
          videoUrl: video_url,
          platform,
          resultFileUrl: downloadUrl,
          videoDuration: parseResult.duration,
        },
      });
    } catch (e) {
      if (e instanceof PointsInsufficientError) return err(ErrCode.PointsInsufficient, e.message);
      throw e;
    }

    const minutes = Math.floor(parseResult.duration / 60).toString().padStart(2, '0');
    const seconds = (parseResult.duration % 60).toString().padStart(2, '0');

    return ok({
      title: parseResult.title,
      platform,
      duration: parseResult.duration,
      duration_text: `${minutes}:${seconds}`,
      thumbnail: parseResult.thumbnail,
      download_url: downloadUrl,
      points_consumed: POINTS,
      points_remaining: consumeResult.balanceAfter,
    }, '视频解析成功');
  });
}
