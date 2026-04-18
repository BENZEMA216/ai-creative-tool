import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { testPrisma, resetDb } from '../helpers/test-db';
import { ensureAdminBootstrap } from '@/lib/core/admin-bootstrap';

beforeEach(async () => {
  await resetDb();
});

describe('ensureAdminBootstrap', () => {
  it('creates admin user with random password when none configured', async () => {
    delete process.env.ADMIN_INITIAL_PASSWORD;
    process.env.ADMIN_USERNAME = 'admin';

    const result = await ensureAdminBootstrap();
    expect(result.created).toBe(true);
    expect(result.username).toBe('admin');
    expect(result.password).toMatch(/^.{16,}$/);

    const admin = await testPrisma.adminUser.findUnique({ where: { username: 'admin' } });
    expect(admin).toBeTruthy();
    expect(admin!.mustChangePassword).toBe(true);
    const matches = await bcrypt.compare(result.password!, admin!.passwordHash);
    expect(matches).toBe(true);
  });

  it('uses ADMIN_INITIAL_PASSWORD when set', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_INITIAL_PASSWORD = 'my-secret-pw-12345';

    const result = await ensureAdminBootstrap();
    expect(result.created).toBe(true);

    const admin = await testPrisma.adminUser.findUnique({ where: { username: 'admin' } });
    const matches = await bcrypt.compare('my-secret-pw-12345', admin!.passwordHash);
    expect(matches).toBe(true);
  });

  it('skips when admin already exists', async () => {
    await testPrisma.adminUser.create({
      data: { username: 'admin', passwordHash: await bcrypt.hash('xxx', 4), mustChangePassword: false },
    });
    const result = await ensureAdminBootstrap();
    expect(result.created).toBe(false);
  });
});
