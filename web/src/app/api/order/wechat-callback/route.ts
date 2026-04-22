import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { handleWechatCallback } from '@/lib/services/order-service';

export const POST = compose(
  withErrorBoundary(),
)(async (req) => {
  let body: unknown;
  try { body = await req.json(); } catch { return ok({ received: true }); }

  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  await handleWechatCallback({ headers, body });
  return ok({ received: true });
});
