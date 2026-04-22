import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { testPrisma, resetDb } from '../helpers/test-db';
import {
  adminLogin, changeAdminPassword, getAdminProfile,
  listUsers, adjustUserPoints, setUserBan,
  listUsageRecords, exportUsageRecordsCsv,
} from '@/lib/services/admin-service';
import { ErrCode } from '@/lib/domain/errors';

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  process.env.ADMIN_JWT_SECRET = 'admin-test-secret-min-32-chars-12345';
  await resetDb();
});

async function seedAdmin(pw = 'admin123456', mustChange = true) {
  return testPrisma.adminUser.create({
    data: {
      username: 'admin',
      passwordHash: await bcrypt.hash(pw, 4),
      mustChangePassword: mustChange,
      role: 'super_admin',
    },
  });
}

describe('AdminService.adminLogin', () => {
  it('returns token on valid creds', async () => {
    await seedAdmin('pw', true);
    const r = await adminLogin('admin', 'pw');
    expect(r.token).toBeTruthy();
    expect(r.must_change_password).toBe(true);
  });

  it('rejects wrong password', async () => {
    await seedAdmin('correct');
    await expect(adminLogin('admin', 'wrong')).rejects.toMatchObject({
      code: ErrCode.AdminPermissionDenied,
    });
  });
});

describe('AdminService.changeAdminPassword', () => {
  it('updates hash + clears mustChange', async () => {
    const a = await seedAdmin('old');
    await changeAdminPassword(a.id, 'old', 'newpassword123');
    const updated = await testPrisma.adminUser.findUnique({ where: { id: a.id } });
    expect(updated!.mustChangePassword).toBe(false);
    expect(await bcrypt.compare('newpassword123', updated!.passwordHash)).toBe(true);
  });
});

describe('AdminService.listUsers', () => {
  it('paginates + masks phone', async () => {
    await seedAdmin();
    await testPrisma.user.createMany({
      data: [
        { userId: 'AC00000001', phone: '13800138001', points: 1 },
        { userId: 'AC00000002', phone: '13800138002', points: 2 },
      ],
    });
    const r = await listUsers({ page: 1, pageSize: 10 });
    expect(r.total).toBe(2);
    expect(r.items[0].phone).toMatch(/\*+/);
  });

  it('filters by q', async () => {
    await seedAdmin();
    await testPrisma.user.createMany({
      data: [
        { userId: 'AC10000001', phone: '13800138001', points: 1 },
        { userId: 'AC22222222', phone: '13800138002', points: 2 },
      ],
    });
    const r = await listUsers({ page: 1, pageSize: 10, q: 'AC1' });
    expect(r.total).toBe(1);
  });
});

describe('AdminService.adjustUserPoints', () => {
  it('applies positive + negative adjustments', async () => {
    await seedAdmin();
    const u = await testPrisma.user.create({
      data: { userId: 'AC30000001', phone: '13000130000', points: 100 },
    });
    const r1 = await adjustUserPoints(u.id, 50, 'grant');
    expect(r1.balance_after).toBe(150);
    const r2 = await adjustUserPoints(u.id, -30, 'penalty');
    expect(r2.balance_after).toBe(120);
  });
});

describe('AdminService.setUserBan', () => {
  it('toggles status', async () => {
    await seedAdmin();
    const u = await testPrisma.user.create({
      data: { userId: 'AC40000001', phone: '13000140000', points: 0 },
    });
    await setUserBan(u.id, true);
    const b = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(b!.status).toBe('banned');
    await setUserBan(u.id, false);
    const a = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(a!.status).toBe('active');
  });
});

describe('AdminService.listUsageRecords + export', () => {
  it('lists + csv export includes header + rows', async () => {
    await seedAdmin();
    const u = await testPrisma.user.create({
      data: { userId: 'AC50000001', phone: '13000150000', points: 100 },
    });
    await testPrisma.usageRecord.create({
      data: {
        userId: u.id, type: 'extract_text', videoUrl: 'https://x',
        platform: 'youtube', status: 'success', pointsConsumed: 10,
      },
    });
    const list = await listUsageRecords({ page: 1, pageSize: 10 });
    expect(list.total).toBe(1);

    const csv = await exportUsageRecordsCsv({});
    expect(csv).toContain('user_id,type');
    expect(csv).toContain('AC50000001');
    expect(csv).toContain('extract_text');
  });
});
