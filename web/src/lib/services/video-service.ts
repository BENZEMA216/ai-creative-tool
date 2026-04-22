import { promises as fs } from 'node:fs';
import { AppError, ErrCode } from '@/lib/core/errors';
import { resolvePlatform, type Platform } from '@/lib/core/platform';
import { consumePoints, recordFailedUsage, PointsInsufficientError } from '@/lib/core/points';
import { getYtdlpClient } from '@/lib/clients/ytdlp';
import { getWhisperClient } from '@/lib/clients/whisper';
import { prisma } from '@/lib/db/prisma';

const EXTRACT_TEXT_POINTS = 10;
const PARSE_VIDEO_POINTS = 20;
const MAX_DURATION_SECONDS = 1800; // 30 min

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export interface ExtractTextResult {
  title: string;
  platform: Platform;
  duration: number;
  duration_text: string;
  text: string;
  points_consumed: number;
  points_remaining: number;
}

export interface ParseVideoResult {
  title: string;
  platform: Platform;
  duration: number;
  duration_text: string;
  thumbnail: string;
  download_url: string;
  points_consumed: number;
  points_remaining: number;
}

/**
 * 提取视频文案。成功扣 10 积分，失败不扣但写 usage record。
 */
export async function extractText(userId: string, videoUrl: string): Promise<ExtractTextResult> {
  const platform = resolvePlatform(videoUrl);
  if (!platform) throw new AppError(ErrCode.UnsupportedPlatform, '不支持的视频平台');

  // 预检余额（FOR UPDATE 保证在 consumePoints 内，这里仅为快速失败）
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
  if (!u || u.points < EXTRACT_TEXT_POINTS) {
    throw new AppError(
      ErrCode.PointsInsufficient,
      `积分不足，当前 ${u?.points ?? 0} / 需要 ${EXTRACT_TEXT_POINTS}`
    );
  }

  let extract: Awaited<ReturnType<ReturnType<typeof getYtdlpClient>['extractAudio']>>;
  try {
    extract = await getYtdlpClient().extractAudio(videoUrl);
  } catch (e) {
    const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : '视频解析失败');
    await recordFailedUsage({ userId, type: 'extract_text', videoUrl, platform, errorMessage: msg });
    throw new AppError(ErrCode.VideoParseFailed, msg);
  }

  if (extract.duration > MAX_DURATION_SECONDS) {
    fs.unlink(extract.audio_path).catch(() => {});
    await recordFailedUsage({
      userId, type: 'extract_text', videoUrl, platform,
      errorMessage: `视频时长 ${extract.duration}s 超过 ${MAX_DURATION_SECONDS}s`,
    });
    throw new AppError(ErrCode.VideoTooLong, '视频时长超出限制（最大 30 分钟）');
  }

  let transcribed: Awaited<ReturnType<ReturnType<typeof getWhisperClient>['transcribe']>>;
  try {
    transcribed = await getWhisperClient().transcribe(extract.audio_path);
  } catch (e) {
    fs.unlink(extract.audio_path).catch(() => {});
    const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : 'Whisper 转写失败');
    await recordFailedUsage({ userId, type: 'extract_text', videoUrl, platform, errorMessage: msg });
    throw new AppError(ErrCode.WhisperFailed, msg);
  }

  try {
    const consume = await consumePoints({
      userId,
      amount: EXTRACT_TEXT_POINTS,
      description: '文案提取',
      usageRecord: {
        type: 'extract_text',
        videoUrl,
        platform,
        resultText: transcribed.text,
        videoDuration: extract.duration,
      },
    });

    return {
      title: extract.title,
      platform,
      duration: extract.duration,
      duration_text: formatDuration(extract.duration),
      text: transcribed.text,
      points_consumed: EXTRACT_TEXT_POINTS,
      points_remaining: consume.balanceAfter,
    };
  } catch (e) {
    if (e instanceof PointsInsufficientError) {
      throw new AppError(ErrCode.PointsInsufficient, e.message);
    }
    throw e;
  } finally {
    fs.unlink(extract.audio_path).catch(() => {});
  }
}

/**
 * 解析视频用于下载。成功扣 20 积分。
 */
export async function parseVideo(userId: string, videoUrl: string): Promise<ParseVideoResult> {
  const platform = resolvePlatform(videoUrl);
  if (!platform) throw new AppError(ErrCode.UnsupportedPlatform, '不支持的视频平台');

  const u = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
  if (!u || u.points < PARSE_VIDEO_POINTS) {
    throw new AppError(
      ErrCode.PointsInsufficient,
      `积分不足，当前 ${u?.points ?? 0} / 需要 ${PARSE_VIDEO_POINTS}`
    );
  }

  let parseResult: Awaited<ReturnType<ReturnType<typeof getYtdlpClient>['parseVideo']>>;
  try {
    parseResult = await getYtdlpClient().parseVideo(videoUrl);
  } catch (e) {
    const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : '视频解析失败');
    await recordFailedUsage({ userId, type: 'download_video', videoUrl, platform, errorMessage: msg });
    throw new AppError(ErrCode.VideoParseFailed, msg);
  }

  if (parseResult.duration > MAX_DURATION_SECONDS) {
    await recordFailedUsage({
      userId, type: 'download_video', videoUrl, platform,
      errorMessage: `时长 ${parseResult.duration}s 超出`,
    });
    throw new AppError(ErrCode.VideoTooLong, '视频时长超出限制');
  }

  const downloadUrl = getYtdlpClient().buildDownloadUrl(parseResult.download_token);

  try {
    const consume = await consumePoints({
      userId,
      amount: PARSE_VIDEO_POINTS,
      description: '视频下载解析',
      usageRecord: {
        type: 'download_video',
        videoUrl,
        platform,
        resultFileUrl: downloadUrl,
        videoDuration: parseResult.duration,
      },
    });

    return {
      title: parseResult.title,
      platform,
      duration: parseResult.duration,
      duration_text: formatDuration(parseResult.duration),
      thumbnail: parseResult.thumbnail,
      download_url: downloadUrl,
      points_consumed: PARSE_VIDEO_POINTS,
      points_remaining: consume.balanceAfter,
    };
  } catch (e) {
    if (e instanceof PointsInsufficientError) {
      throw new AppError(ErrCode.PointsInsufficient, e.message);
    }
    throw e;
  }
}
