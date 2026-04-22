import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PACKAGES = [
  { code: 'basic',    name: '基础', yuan: 19.9, points: 2000,  badge: null,        sortOrder: 1 },
  { code: 'standard', name: '标准', yuan: 39.9, points: 5000,  badge: '多送 25%', sortOrder: 2 },
  { code: 'premium',  name: '尊享', yuan: 99.9, points: 12000, badge: '多送 20%', sortOrder: 3 },
];

async function main() {
  for (const p of PACKAGES) {
    await prisma.package.upsert({
      where: { code: p.code },
      update: p,
      create: p,
    });
  }
  console.log('Seeded', PACKAGES.length, 'packages');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
