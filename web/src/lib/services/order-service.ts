import { AppError, ErrCode } from '@/lib/domain/errors';
import { generateOrderNo } from '@/lib/util/order-no';
import { getPackageInfo, isValidPackageType, ORDER_EXPIRY_MS } from '@/lib/domain/packages';
import { prisma } from '@/lib/db/prisma';
import { getPayClient } from '@/lib/clients/pay';
import { addPoints } from '@/lib/services/points-service';
import type { PackageType } from '@prisma/client';

export interface CreateOrderResult {
  order_no: string;
  amount: number;
  points: number;
  qr_code_url: string;
  expire_at: string;
}

export interface OrderStatusResult {
  order_no: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'expired';
  amount: number;
  points: number;
  paid_at: string | null;
  created_at: string;
}

/**
 * 创建充值订单 + 调用 pay client 拿二维码 URL。
 */
export async function createOrder(userId: string, packageType: string): Promise<CreateOrderResult> {
  if (!isValidPackageType(packageType)) {
    throw new AppError(ErrCode.InternalError, '无效套餐类型');
  }
  const pkg = getPackageInfo(packageType as PackageType);

  const orderNo = generateOrderNo();

  const order = await prisma.order.create({
    data: {
      orderNo,
      userId,
      packageType: packageType as PackageType,
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
    const msg = e instanceof AppError ? e.message : (e instanceof Error ? e.message : '创建支付订单失败');
    throw new AppError(ErrCode.WechatPayCreateFailed, msg);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { wechatPrepayId: payResult.prepayId },
  });

  const expireAt = new Date(order.createdAt.getTime() + ORDER_EXPIRY_MS);

  return {
    order_no: orderNo,
    amount: pkg.yuan,
    points: pkg.points,
    qr_code_url: payResult.qrCodeUrl,
    expire_at: expireAt.toISOString(),
  };
}

/**
 * 查单状态 + 自动 expired 迁移（pending + 过期 → expired）。
 */
export async function getOrderStatus(userId: string, orderNo: string): Promise<OrderStatusResult> {
  const order = await prisma.order.findUnique({ where: { orderNo } });
  if (!order || order.userId !== userId) {
    throw new AppError(ErrCode.OrderInvalid, '订单不存在或无权访问');
  }

  let status = order.status;
  if (status === 'pending' && order.createdAt.getTime() + ORDER_EXPIRY_MS < Date.now()) {
    await prisma.order.update({ where: { id: order.id }, data: { status: 'expired' } }).catch(() => {});
    status = 'expired';
  }

  return {
    order_no: order.orderNo,
    status,
    amount: Number(order.amountYuan),
    points: order.points,
    paid_at: order.paidAt?.toISOString() ?? null,
    created_at: order.createdAt.toISOString(),
  };
}

export interface CallbackInput {
  headers: Record<string, string | undefined>;
  body: unknown;
}

/**
 * 处理微信回调。幂等：状态机保证 pending → paid 只转一次，重复回调不会双扣积分。
 */
export async function handleWechatCallback(input: CallbackInput): Promise<void> {
  let verified;
  try {
    verified = getPayClient().verifyCallback(input.headers, input.body);
  } catch {
    return;  // 验签失败不再处理，但外层仍返回 200
  }
  if (!verified.orderNo) return;

  const order = await prisma.order.findUnique({ where: { orderNo: verified.orderNo } });
  if (!order) return;

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
}
