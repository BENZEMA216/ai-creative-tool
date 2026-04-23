import { z } from 'zod';
import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { requireAuth, getAuthedUser } from '@/lib/middleware/with-auth';
import { createOrder } from '@/lib/services/order-service';

const bodySchema = z.object({
  package_type: z.string(),
  method: z.enum(['native', 'h5']).optional(),
});

function getClientIp(req: Request): string {
  // Try X-Forwarded-For (nginx / CF), then fallback
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '0.0.0.0';  // WeChat accepts 0.0.0.0 in test
}

export const POST = compose(
  withErrorBoundary(),
  requireAuth(),
)(async (req) => {
  const { package_type, method } = await parseBody(req, bodySchema);
  const user = getAuthedUser(req);
  const result = await createOrder(user.uid, package_type, {
    method,
    clientIp: getClientIp(req),
  });
  return ok(result, '订单已创建');
});
