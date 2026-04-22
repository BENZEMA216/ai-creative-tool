import { nanoid } from 'nanoid';
import { prisma } from '@/lib/db/prisma';
import { generateUserId } from './user-id';

const STARTER_POINTS = 100;

export interface AnonUserResult {
  uid: string;
  userId: string;
}

/**
 * 创建一个匿名用户。phone 字段用 `anon-<nanoid>` 填充（保留 NOT NULL + UNIQUE）。
 * 初始赠送 STARTER_POINTS 积分。
 */
export async function createAnonUser(): Promise<AnonUserResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const userId = generateUserId();
    const phone = `anon-${nanoid(12)}`;
    try {
      const user = await prisma.user.create({
        data: {
          userId,
          phone,
          points: STARTER_POINTS,
          nickname: '匿名用户',
        },
      });
      return { uid: user.id, userId: user.userId };
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
