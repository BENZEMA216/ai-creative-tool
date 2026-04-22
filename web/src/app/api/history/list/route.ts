import { compose } from '@/lib/http/compose';
import { requireAuth, getAuthedUser } from '@/lib/middleware/with-auth';
import { ok } from '@/lib/http/response';
import { prisma } from '@/lib/db/prisma';
import type { UsageType, UsageStatus } from '@prisma/client';

export const GET = compose(requireAuth())(async (req) => {
  const user = getAuthedUser(req);
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size') ?? '20')));
  const type = url.searchParams.get('type') as UsageType | null;
  const status = url.searchParams.get('status') as UsageStatus | null;

  const where: Record<string, unknown> = { userId: user.uid };
  if (type) where.type = type;
  if (status) where.status = status;

  const [total, items] = await Promise.all([
    prisma.usageRecord.count({ where }),
    prisma.usageRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    total,
    page,
    page_size: pageSize,
    items: items.map(r => ({
      id: r.id,
      type: r.type,
      platform: r.platform,
      status: r.status,
      points_consumed: r.pointsConsumed,
      video_url: r.videoUrl,
      video_duration: r.videoDuration,
      error_message: r.errorMessage,
      created_at: r.createdAt.toISOString(),
    })),
  });
});
