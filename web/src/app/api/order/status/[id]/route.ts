import { withAuth } from '@/lib/middleware/with-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';
import { ORDER_EXPIRY_MS } from '@/lib/core/orders';

export async function GET(req: Request, ctx: { params: { id: string } }) {
  return withAuth(req, async (_, user) => {
    const orderNo = ctx.params.id;
    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.userId !== user.uid) {
      return err(ErrCode.OrderInvalid, '订单不存在或无权访问');
    }

    let status = order.status;
    if (status === 'pending' && order.createdAt.getTime() + ORDER_EXPIRY_MS < Date.now()) {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'expired' } }).catch(() => {});
      status = 'expired';
    }

    return ok({
      order_no: order.orderNo,
      status,
      amount: Number(order.amountYuan),
      points: order.points,
      paid_at: order.paidAt?.toISOString() ?? null,
      created_at: order.createdAt.toISOString(),
    });
  });
}
