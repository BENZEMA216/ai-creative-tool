import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

export interface BootstrapResult {
  created: boolean;
  username?: string;
  password?: string;
}

function randomPassword(): string {
  return randomBytes(12).toString('base64url').slice(0, 18);
}

export async function ensureAdminBootstrap(): Promise<BootstrapResult> {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const existing = await prisma.adminUser.findFirst();
  if (existing) return { created: false };

  let password = process.env.ADMIN_INITIAL_PASSWORD;
  let randomized = false;
  if (!password) {
    password = randomPassword();
    randomized = true;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.adminUser.create({
    data: { username, passwordHash, mustChangePassword: true, role: 'super_admin' },
  });

  if (randomized) {
    console.log('================================================');
    console.log(`  ADMIN BOOTSTRAP: created admin '${username}'`);
    console.log(`  initial password: ${password}`);
    console.log(`  (强制首次登录修改)`);
    console.log('================================================');
  }

  return { created: true, username, password };
}
