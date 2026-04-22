import { z } from 'zod';
import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { requireAuth, getAuthedUser } from '@/lib/middleware/with-auth';
import { userRateLimit } from '@/lib/middleware/with-rate-limit';
import { extractText } from '@/lib/services/video-service';

const bodySchema = z.object({ video_url: z.string().url() });

export const POST = compose(
  withErrorBoundary(),
  requireAuth(),
  userRateLimit('extract-text', 10, 60),
)(async (req) => {
  const { video_url } = await parseBody(req, bodySchema);
  const user = getAuthedUser(req);
  const result = await extractText(user.uid, video_url);
  return ok(result, '文案提取成功');
});
