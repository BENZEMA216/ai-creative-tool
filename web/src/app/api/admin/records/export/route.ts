import { stringify } from 'csv-stringify/sync';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { prisma } from '@/lib/db/prisma';
import type { UsageType, UsageStatus } from '@prisma/client';

export async function GET(req: Request) {
  return withAdminAuth(req, async () => {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') as UsageType | null;
    const status = url.searchParams.get('status') as UsageStatus | null;
    const platform = url.searchParams.get('platform')?.trim();

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (platform) where.platform = platform;
    if (status) where.status = status;

    const items = await prisma.usageRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      include: { user: { select: { userId: true } } },
    });

    const rows = items.map(r => ({
      user_id: r.user.userId,
      type: r.type,
      platform: r.platform,
      status: r.status,
      points_consumed: r.pointsConsumed,
      video_url: r.videoUrl,
      video_duration: r.videoDuration ?? '',
      error_message: r.errorMessage ?? '',
      created_at: r.createdAt.toISOString(),
    }));

    const csv = stringify(rows, {
      header: true,
      columns: ['user_id', 'type', 'platform', 'status', 'points_consumed', 'video_url', 'video_duration', 'error_message', 'created_at'],
    });

    const filename = `records-${new Date().toISOString().split('T')[0]}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  });
}
