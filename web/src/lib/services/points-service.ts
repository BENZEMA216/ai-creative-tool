import { prisma } from '@/lib/db/prisma';
import type { UsageType } from '@prisma/client';

export class PointsInsufficientError extends Error {
  constructor(public readonly current: number, public readonly required: number) {
    super(`积分不足，当前 ${current} / 需要 ${required}`);
    this.name = 'PointsInsufficientError';
  }
}

export interface UsageRecordInput {
  type: UsageType;
  videoUrl: string;
  platform: string;
  resultText?: string;
  resultFileUrl?: string;
  videoDuration?: number;
}

export interface ConsumeInput {
  userId: string;
  amount: number;
  description: string;
  usageRecord: UsageRecordInput;
  relatedOrderId?: string;
}

export interface ConsumeResult {
  balanceAfter: number;
}

export async function consumePoints(input: ConsumeInput): Promise<ConsumeResult> {
  return await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ points: number }>>(
      'SELECT points FROM users WHERE id = $1::uuid FOR UPDATE',
      input.userId
    );
    if (rows.length === 0) throw new Error(`user not found: ${input.userId}`);
    const current = rows[0].points;
    if (current < input.amount) throw new PointsInsufficientError(current, input.amount);

    const balanceAfter = current - input.amount;

    await tx.user.update({
      where: { id: input.userId },
      data: { points: balanceAfter },
    });

    await tx.pointTransaction.create({
      data: {
        userId: input.userId,
        type: 'consume',
        amount: -input.amount,
        balanceAfter,
        description: input.description,
        relatedOrderId: input.relatedOrderId,
      },
    });

    await tx.usageRecord.create({
      data: {
        userId: input.userId,
        type: input.usageRecord.type,
        videoUrl: input.usageRecord.videoUrl,
        platform: input.usageRecord.platform,
        status: 'success',
        pointsConsumed: input.amount,
        resultText: input.usageRecord.resultText,
        resultFileUrl: input.usageRecord.resultFileUrl,
        videoDuration: input.usageRecord.videoDuration,
      },
    });

    return { balanceAfter };
  }, { isolationLevel: 'Serializable' });
}

export interface AddInput {
  userId: string;
  amount: number;
  description: string;
  relatedOrderId?: string;
}

export async function addPoints(input: AddInput): Promise<ConsumeResult> {
  return await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: input.userId },
      data: { points: { increment: input.amount } },
    });
    await tx.pointTransaction.create({
      data: {
        userId: input.userId,
        type: 'recharge',
        amount: input.amount,
        balanceAfter: u.points,
        description: input.description,
        relatedOrderId: input.relatedOrderId,
      },
    });
    return { balanceAfter: u.points };
  });
}

export interface AdjustInput {
  userId: string;
  amount: number;
  description: string;
}

export async function adminAdjustPoints(input: AdjustInput): Promise<ConsumeResult> {
  return await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: input.userId },
      data: { points: { increment: input.amount } },
    });
    if (u.points < 0) throw new Error('调整后余额不能为负');
    await tx.pointTransaction.create({
      data: {
        userId: input.userId,
        type: 'admin_adjust',
        amount: input.amount,
        balanceAfter: u.points,
        description: input.description,
      },
    });
    return { balanceAfter: u.points };
  });
}

export async function recordFailedUsage(input: {
  userId: string;
  type: UsageType;
  videoUrl: string;
  platform: string;
  errorMessage: string;
}): Promise<void> {
  await prisma.usageRecord.create({
    data: {
      userId: input.userId,
      type: input.type,
      videoUrl: input.videoUrl,
      platform: input.platform,
      status: 'failed',
      pointsConsumed: 0,
      errorMessage: input.errorMessage,
    },
  });
}
