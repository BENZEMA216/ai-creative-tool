import { NextResponse } from 'next/server';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { requireAdmin } from '@/lib/middleware/with-admin-auth';
import { exportUsageRecordsCsv } from '@/lib/services/admin-service';
import type { UsageType, UsageStatus } from '@prisma/client';

export const GET = compose(
  withErrorBoundary(),
  requireAdmin(),
)(async (req) => {
  const url = new URL(req.url);
  const csv = await exportUsageRecordsCsv({
    type: url.searchParams.get('type') as UsageType | null ?? undefined,
    platform: url.searchParams.get('platform')?.trim() || undefined,
    status: url.searchParams.get('status') as UsageStatus | null ?? undefined,
  });
  const filename = `records-${new Date().toISOString().split('T')[0]}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});
