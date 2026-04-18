import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: Request) {
  return withAdminAuth(req, async (_, admin) => {
    const a = await prisma.adminUser.findUnique({ where: { id: admin.aid } });
    if (!a) return err(ErrCode.AdminPermissionDenied, 'admin not found');
    return ok({
      username: a.username,
      role: a.role,
      must_change_password: a.mustChangePassword,
    });
  });
}
