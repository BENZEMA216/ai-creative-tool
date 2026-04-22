import { z } from 'zod';
import { ok } from '@/lib/core/http';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { requireAuth, getAuthedUser } from '@/lib/middleware/with-auth';
import { createOrder } from '@/lib/services/order-service';

const bodySchema = z.object({ package_type: z.string() });

export const POST = compose(
  withErrorBoundary(),
  requireAuth(),
)(async (req) => {
  const { package_type } = await parseBody(req, bodySchema);
  const user = getAuthedUser(req);
  const result = await createOrder(user.uid, package_type);
  return ok(result, '订单已创建');
});
