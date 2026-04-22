import { z } from 'zod';
import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { adminLogin } from '@/lib/services/admin-service';
import { ADMIN_COOKIE } from '@/lib/middleware/with-admin-auth';

const COOKIE_MAX_AGE = 12 * 60 * 60;

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const POST = compose(
  withErrorBoundary(),
)(async (req) => {
  const { username, password } = await parseBody(req, bodySchema);
  const result = await adminLogin(username, password);
  const res = ok(result, '登录成功');
  res.headers.append(
    'Set-Cookie',
    `${ADMIN_COOKIE}=${result.token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`
  );
  return res;
});
