import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';

const reqSchema = z.object({
  old_password: z.string().min(1),
  new_password: z.string().min(8, '新密码至少 8 位').max(100),
});

export async function POST(req: Request) {
  return withAdminAuth(req, async (request, admin) => {
    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');

    const a = await prisma.adminUser.findUnique({ where: { id: admin.aid } });
    if (!a) return err(ErrCode.AdminPermissionDenied, 'admin not found');

    const ok2 = await bcrypt.compare(parsed.data.old_password, a.passwordHash);
    if (!ok2) return err(ErrCode.AdminPermissionDenied, '旧密码错误');

    const newHash = await bcrypt.hash(parsed.data.new_password, 12);
    await prisma.adminUser.update({
      where: { id: a.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    return ok({ updated: true }, '密码已更新');
  });
}
