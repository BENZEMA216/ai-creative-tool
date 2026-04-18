import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok } from '@/lib/core/http';
import { prisma } from '@/lib/db/prisma';

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

export async function GET(req: Request) {
  return withAdminAuth(req, async (request: Request) => {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? '20')));
    const q = url.searchParams.get('q')?.trim();

    const where = q
      ? { OR: [{ userId: { contains: q, mode: 'insensitive' as const } }, { phone: { contains: q } }] }
      : undefined;

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
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
      items: items.map(u => ({
        id: u.id,
        user_id: u.userId,
        phone: maskPhone(u.phone),
        nickname: u.nickname,
        points: u.points,
        status: u.status,
        created_at: u.createdAt.toISOString(),
      })),
    });
  });
}
