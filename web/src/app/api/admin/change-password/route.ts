import { z } from 'zod';
import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { requireAdmin, getAuthedAdmin } from '@/lib/middleware/with-admin-auth';
import { changeAdminPassword } from '@/lib/services/admin-service';

const bodySchema = z.object({
  old_password: z.string().min(1),
  new_password: z.string().min(8, '新密码至少 8 位').max(100),
});

export const POST = compose(
  withErrorBoundary(),
  requireAdmin(),
)(async (req) => {
  const { old_password, new_password } = await parseBody(req, bodySchema);
  const admin = getAuthedAdmin(req);
  await changeAdminPassword(admin.aid, old_password, new_password);
  return ok({ updated: true }, '密码已更新');
});
