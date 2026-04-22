import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { requireAdmin } from '@/lib/middleware/with-admin-auth';
import { listUsageRecords } from '@/lib/services/admin-service';
import type { UsageType, UsageStatus } from '@prisma/client';

export const GET = compose(
  withErrorBoundary(),
  requireAdmin(),
)(async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? '20')));
  const result = await listUsageRecords({
    page,
    pageSize,
    userIdFilter: url.searchParams.get('user_id')?.trim() || undefined,
    type: url.searchParams.get('type') as UsageType | null ?? undefined,
    platform: url.searchParams.get('platform')?.trim() || undefined,
    status: url.searchParams.get('status') as UsageStatus | null ?? undefined,
  });
  return ok(result);
});
