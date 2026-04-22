import { ok } from '@/lib/core/http';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { requireAdmin } from '@/lib/middleware/with-admin-auth';
import { listUsers } from '@/lib/services/admin-service';

export const GET = compose(
  withErrorBoundary(),
  requireAdmin(),
)(async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? '20')));
  const q = url.searchParams.get('q')?.trim() || undefined;
  const result = await listUsers({ page, pageSize, q });
  return ok(result);
});
