import { z } from 'zod';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { adminAdjustPoints } from '@/lib/core/points';

const reqSchema = z.object({
  amount: z.number().int(),
  reason: z.string().min(1).max(200),
});

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  return withAdminAuth(req, async (request) => {
    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '参数非法');

    try {
      const result = await adminAdjustPoints({
        userId: ctx.params.id,
        amount: parsed.data.amount,
        description: `[ADMIN] ${parsed.data.reason}`,
      });
      return ok({ balance_after: result.balanceAfter });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '调整失败';
      return err(ErrCode.InternalError, msg);
    }
  });
}
