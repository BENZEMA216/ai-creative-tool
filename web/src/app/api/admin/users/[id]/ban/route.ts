import { z } from 'zod';
import { ok } from '@/lib/core/http';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { requireAdmin } from '@/lib/middleware/with-admin-auth';
import { setUserBan } from '@/lib/services/admin-service';

const bodySchema = z.object({ banned: z.boolean() });

export const PUT = compose(
  withErrorBoundary(),
  requireAdmin(),
)(async (req, ctx) => {
  const { banned } = await parseBody(req, bodySchema);
  const result = await setUserBan(ctx!.params.id, banned);
  return ok(result);
});
