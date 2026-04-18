import { withAuth } from '@/lib/middleware/with-auth';
import { prisma } from '@/lib/db/prisma';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

export async function GET(req: Request) {
  return withAuth(req, async (_, user) => {
    const u = await prisma.user.findUnique({ where: { id: user.uid } });
    if (!u) return err(ErrCode.Unauthorized, '用户不存在');
    if (u.status === 'banned') return err(ErrCode.AccountBanned, '账号已被封禁');
    return ok({
      user_id: u.userId,
      phone: maskPhone(u.phone),
      nickname: u.nickname,
      avatar_url: u.avatarUrl,
      points: u.points,
    });
  });
}
