import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { loginSchema } from '@/lib/validation/auth';
import { loginWithCode } from '@/lib/services/user-service';

const COOKIE_NAME = 'auth-token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export const POST = compose(
  withErrorBoundary(),
)(async (req) => {
  const { phone, code } = await parseBody(req, loginSchema);
  const result = await loginWithCode(phone, code);
  const res = ok(result, '登录成功');
  res.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${result.token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`
  );
  return res;
});
