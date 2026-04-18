import { ok } from '@/lib/core/http';
import { prisma } from '@/lib/db/prisma';
import { getPayClient } from '@/lib/clients/pay';
import { addPoints } from '@/lib/core/points';

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return ok({ received: true }); }

  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  let verified;
  try {
    verified = getPayClient().verifyCallback(headers, body);
  } catch {
    return ok({ received: true });
  }

  if (!verified.orderNo) return ok({ received: true });

  const order = await prisma.order.findUnique({ where: { orderNo: verified.orderNo } });
  if (!order) return ok({ received: true });

  if (verified.success) {
    const result = await prisma.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'paid', paidAt: new Date() },
    });
    if (result.count === 1) {
      await addPoints({
        userId: order.userId,
        amount: order.points,
        description: `充值${order.points}积分`,
        relatedOrderId: order.orderNo,
      });
    }
  } else {
    await prisma.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'failed' },
    });
  }

  return ok({ received: true });
}
