import { ok } from '@/lib/core/http';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { requireAuth, getAuthedUser } from '@/lib/middleware/with-auth';
import { getUserProfile } from '@/lib/services/user-service';

export const GET = compose(
  withErrorBoundary(),
  requireAuth(),
)(async (req) => {
  const user = getAuthedUser(req);
  const result = await getUserProfile(user.uid);
  return ok(result);
});
