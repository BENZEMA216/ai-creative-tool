import { ok } from '@/lib/core/http';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { requireAdmin, getAuthedAdmin } from '@/lib/middleware/with-admin-auth';
import { getAdminProfile } from '@/lib/services/admin-service';

export const GET = compose(
  withErrorBoundary(),
  requireAdmin(),
)(async (req) => {
  const admin = getAuthedAdmin(req);
  const result = await getAdminProfile(admin.aid);
  return ok(result);
});
