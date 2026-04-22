import { z } from 'zod';
import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { requireAdmin } from '@/lib/middleware/with-admin-auth';
import { adjustUserPoints } from '@/lib/services/admin-service';

const bodySchema = z.object({
  amount: z.number().int(),
  reason: z.string().min(1).max(200),
});

export const PUT = compose(
  withErrorBoundary(),
  requireAdmin(),
)(async (req, ctx) => {
  const { amount, reason } = await parseBody(req, bodySchema);
  const result = await adjustUserPoints(ctx!.params.id, amount, reason);
  return ok(result);
});
