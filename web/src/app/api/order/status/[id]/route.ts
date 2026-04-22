import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { requireAuth, getAuthedUser } from '@/lib/middleware/with-auth';
import { getOrderStatus } from '@/lib/services/order-service';
import type { Handler } from '@/lib/http/compose';

const handler: Handler = async (req, ctx) => {
  const user = getAuthedUser(req);
  const orderNo = ctx?.params.id ?? '';
  const result = await getOrderStatus(user.uid, orderNo);
  return ok(result);
};

export const GET = compose(
  withErrorBoundary(),
  requireAuth(),
)(handler);
