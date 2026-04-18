import { z } from 'zod';
import { withAuth } from '@/lib/middleware/with-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode, AppError } from '@/lib/core/errors';
import { generateOrderNo } from '@/lib/core/order-no';
import { getPackageInfo, isValidPackageType, ORDER_EXPIRY_MS } from '@/lib/core/orders';
import { prisma } from '@/lib/db/prisma';
import { getPayClient } from '@/lib/clients/pay';

const reqSchema = z.object({
  package_type: z.string().refine(isValidPackageType, '无效套餐类型'),
});

export async function POST(req: Request) {
  return withAuth(req, async (request, user) => {
    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');

    const packageType = parsed.data.package_type as 'basic' | 'standard' | 'premium';
    const pkg = getPackageInfo(packageType);

    const orderNo = generateOrderNo();

    const order = await prisma.order.create({
      data: {
        orderNo,
        userId: user.uid,
        packageType,
        amountYuan: pkg.yuan,
        points: pkg.points,
        status: 'pending',
      },
    });

    const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL ?? 'http://localhost:3000/api/order/wechat-callback';

    let payResult;
    try {
      payResult = await getPayClient().createNativeOrder({
        orderNo,
        amountYuan: pkg.yuan,
        description: `AI 智能创作 - ${packageType}套餐`,
        notifyUrl,
      });
    } catch (e) {
      const msg = e instanceof AppError ? e.message : '创建支付订单失败';
      return err(ErrCode.WechatPayCreateFailed, msg);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { wechatPrepayId: payResult.prepayId },
    });

    const expireAt = new Date(order.createdAt.getTime() + ORDER_EXPIRY_MS);

    return ok({
      order_no: orderNo,
      amount: pkg.yuan,
      points: pkg.points,
      qr_code_url: payResult.qrCodeUrl,
      expire_at: expireAt.toISOString(),
    }, '订单已创建');
  });
}
