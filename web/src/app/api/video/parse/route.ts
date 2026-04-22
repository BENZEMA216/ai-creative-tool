import { z } from 'zod';
import { ok } from '@/lib/http/response';
import { compose } from '@/lib/http/compose';
import { withErrorBoundary } from '@/lib/http/error-boundary';
import { parseBody } from '@/lib/http/body';
import { requireAuth, getAuthedUser } from '@/lib/middleware/with-auth';
import { userRateLimit } from '@/lib/middleware/with-rate-limit';
import { parseVideo } from '@/lib/services/video-service';

const bodySchema = z.object({ video_url: z.string().url() });

export const POST = compose(
  withErrorBoundary(),
  requireAuth(),
  userRateLimit('parse-video', 10, 60),
)(async (req) => {
  const { video_url } = await parseBody(req, bodySchema);
  const user = getAuthedUser(req);
  const result = await parseVideo(user.uid, video_url);
  return ok(result, '视频解析成功');
});
