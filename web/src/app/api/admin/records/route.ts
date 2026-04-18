import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok } from '@/lib/core/http';
import { prisma } from '@/lib/db/prisma';
import type { UsageType, UsageStatus } from '@prisma/client';

export async function GET(req: Request) {
  return withAdminAuth(req, async () => {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? '20')));
    const userIdFilter = url.searchParams.get('user_id')?.trim();
    const type = url.searchParams.get('type') as UsageType | null;
    const platform = url.searchParams.get('platform')?.trim();
    const status = url.searchParams.get('status') as UsageStatus | null;

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (platform) where.platform = platform;
    if (status) where.status = status;
    if (userIdFilter) {
      where.user = { userId: { contains: userIdFilter, mode: 'insensitive' } };
    }

    const [total, items] = await Promise.all([
      prisma.usageRecord.count({ where }),
      prisma.usageRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { userId: true } } },
      }),
    ]);

    return ok({
      total,
      page,
      page_size: pageSize,
      items: items.map(r => ({
        id: r.id,
        user_id: r.user.userId,
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
}
