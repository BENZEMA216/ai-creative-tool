import { z } from 'zod';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';

const reqSchema = z.object({ banned: z.boolean() });

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  return withAdminAuth(req, async (request) => {
    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, '参数非法');

    const u = await prisma.user.update({
      where: { id: ctx.params.id },
      data: { status: parsed.data.banned ? 'banned' : 'active' },
    });
    return ok({ id: u.id, status: u.status });
  });
}
