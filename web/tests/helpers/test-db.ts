import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient();

export async function resetDb() {
  // 按依赖顺序清空
  await testPrisma.usageRecord.deleteMany();
  await testPrisma.pointTransaction.deleteMany();
  await testPrisma.order.deleteMany();
  await testPrisma.smsCode.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.adminUser.deleteMany();
}
