import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { sendCodeSchema } from '@/lib/validation/auth';
import { sendSmsCode } from '@/lib/services/user-service';

export const POST = compose(
  withErrorBoundary(),
)(async (req) => {
  const { phone } = await parseBody(req, sendCodeSchema);
  const result = await sendSmsCode(phone);
  return ok(result, '验证码已发送');
});
