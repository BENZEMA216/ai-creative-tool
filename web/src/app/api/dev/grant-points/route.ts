import { withAuth } from '@/lib/middleware/with-auth';
import { addPoints } from '@/lib/services/points-service';
import { ok, err } from '@/lib/http/response';
import { ErrCode } from '@/lib/domain/errors';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return err(ErrCode.AdminPermissionDenied, 'dev only');
  }
  return withAuth(req, async (request, user) => {
    const url = new URL(request.url);
    const amount = Number(url.searchParams.get('amount') ?? '100');
    const result = await addPoints({
      userId: user.uid,
      amount,
      description: 'dev grant',
    });
    return ok({ balanceAfter: result.balanceAfter });
  });
}
