import { PrismaClient } from '@prisma/client';
import { PACKAGES_SEED } from './package-seed';

export const testPrisma = new PrismaClient();

export async function resetDb() {
  // 按依赖顺序清空
  await testPrisma.usageRecord.deleteMany();
  await testPrisma.pointTransaction.deleteMany();
  await testPrisma.order.deleteMany();
  await testPrisma.smsCode.deleteMany();
  await testPrisma.user.deleteMany();
  await testPrisma.adminUser.deleteMany();
  // Don't wipe packages — they're static config data. Ensure they exist:
  for (const p of PACKAGES_SEED) {
    await testPrisma.package.upsert({ where: { code: p.code }, update: p, create: p });
  }
}
