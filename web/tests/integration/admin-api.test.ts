import { describe, it, expect, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { testPrisma, resetDb } from '../helpers/test-db';
import { POST as adminLogin } from '@/app/api/admin/login/route';
import { POST as changePw } from '@/app/api/admin/change-password/route';
import { GET as adminMe } from '@/app/api/admin/me/route';
import { signAdminToken } from '@/lib/core/auth';

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  process.env.ADMIN_JWT_SECRET = 'admin-test-secret-min-32-chars-12345';
  await resetDb();
});

async function seedAdmin(password = 'admin123456', mustChangePassword = true) {
  return testPrisma.adminUser.create({
    data: {
      username: 'admin',
      passwordHash: await bcrypt.hash(password, 4),
      mustChangePassword,
      role: 'super_admin',
    },
  });
}

function loginReq(body: unknown) {
  return new Request('http://localhost/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/admin/login', () => {
  it('returns token + must_change_password flag', async () => {
    await seedAdmin('admin123456', true);
    const res = await adminLogin(loginReq({ username: 'admin', password: 'admin123456' }));
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.token).toBeTruthy();
    expect(json.data.must_change_password).toBe(true);
    expect(res.headers.get('set-cookie')).toContain('admin-token=');
  });

  it('rejects wrong password', async () => {
    await seedAdmin('correct');
    const res = await adminLogin(loginReq({ username: 'admin', password: 'wrong' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rejects unknown username', async () => {
    await seedAdmin();
    const res = await adminLogin(loginReq({ username: 'foo', password: 'x' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });
});

describe('POST /api/admin/change-password', () => {
  it('requires admin auth', async () => {
    const req = new Request('http://localhost/api/admin/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ old_password: 'x', new_password: 'newpw1234' }),
    });
    const res = await changePw(req as any);
    expect(res.status).toBe(403);
  });

  it('updates password + clears must_change_password flag', async () => {
    const a = await seedAdmin('oldpw', true);
    const token = await signAdminToken({ aid: a.id, username: a.username, role: a.role });

    const req = new Request('http://localhost/api/admin/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `admin-token=${token}` },
      body: JSON.stringify({ old_password: 'oldpw', new_password: 'newpw1234' }),
    });
    const res = await changePw(req as any);
    expect((await res.json()).code).toBe(0);

    const updated = await testPrisma.adminUser.findUnique({ where: { id: a.id } });
    expect(updated!.mustChangePassword).toBe(false);
    expect(await bcrypt.compare('newpw1234', updated!.passwordHash)).toBe(true);
  });

  it('rejects wrong old password', async () => {
    const a = await seedAdmin('oldpw');
    const token = await signAdminToken({ aid: a.id, username: a.username, role: a.role });

    const req = new Request('http://localhost/api/admin/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `admin-token=${token}` },
      body: JSON.stringify({ old_password: 'wrong', new_password: 'newpw1234' }),
    });
    const res = await changePw(req as any);
    expect((await res.json()).code).not.toBe(0);
  });

  it('rejects too-short new password', async () => {
    const a = await seedAdmin('oldpw');
    const token = await signAdminToken({ aid: a.id, username: a.username, role: a.role });

    const req = new Request('http://localhost/api/admin/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: `admin-token=${token}` },
      body: JSON.stringify({ old_password: 'oldpw', new_password: '1234' }),
    });
    const res = await changePw(req as any);
    expect((await res.json()).code).not.toBe(0);
  });
});

describe('GET /api/admin/me', () => {
  it('returns admin info', async () => {
    const a = await seedAdmin();
    const token = await signAdminToken({ aid: a.id, username: a.username, role: a.role });
    const req = new Request('http://localhost/api/admin/me', {
      headers: { cookie: `admin-token=${token}` },
    });
    const res = await adminMe(req as any);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.username).toBe('admin');
    expect(json.data.must_change_password).toBe(true);
  });
});

import { GET as adminUsers } from '@/app/api/admin/users/route';
import { PUT as setPoints } from '@/app/api/admin/users/[id]/points/route';
import { PUT as banUser } from '@/app/api/admin/users/[id]/ban/route';

async function adminToken() {
  const a = await seedAdmin('x', false);
  return await signAdminToken({ aid: a.id, username: a.username, role: a.role });
}

async function makeUser(userId: string, points: number) {
  return testPrisma.user.create({
    data: { userId, phone: `138${userId.slice(-8)}`, points },
  });
}

describe('GET /api/admin/users', () => {
  it('lists users with pagination', async () => {
    const token = await adminToken();
    await makeUser('AC10000001', 100);
    await makeUser('AC10000002', 200);

    const req = new Request('http://localhost/api/admin/users?page=1&page_size=10', {
      headers: { cookie: `admin-token=${token}` },
    });
    const res = await adminUsers(req as any);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.total).toBe(2);
    expect(json.data.items).toHaveLength(2);
    expect(json.data.items[0].user_id).toMatch(/^AC/);
    expect(json.data.items[0].phone).toMatch(/\*+/);
  });

  it('searches by user_id', async () => {
    const token = await adminToken();
    await makeUser('AC10000001', 100);
    await makeUser('AC22222222', 200);

    const req = new Request('http://localhost/api/admin/users?q=AC1000', {
      headers: { cookie: `admin-token=${token}` },
    });
    const res = await adminUsers(req as any);
    const json = await res.json();
    expect(json.data.total).toBe(1);
    expect(json.data.items[0].user_id).toBe('AC10000001');
  });

  it('requires admin auth', async () => {
    const req = new Request('http://localhost/api/admin/users');
    const res = await adminUsers(req as any);
    expect(res.status).toBe(403);
  });
});

describe('PUT /api/admin/users/:id/points', () => {
  it('adjusts points + records transaction', async () => {
    const token = await adminToken();
    const u = await makeUser('AC30000001', 50);

    const req = new Request(`http://localhost/api/admin/users/${u.id}/points`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `admin-token=${token}` },
      body: JSON.stringify({ amount: 100, reason: 'manual top-up' }),
    });
    const res = await setPoints(req as any, { params: { id: u.id } });
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.balance_after).toBe(150);

    const tx = await testPrisma.pointTransaction.findFirst({ where: { userId: u.id } });
    expect(tx!.type).toBe('admin_adjust');
    expect(tx!.amount).toBe(100);
  });

  it('supports negative amount (deduct)', async () => {
    const token = await adminToken();
    const u = await makeUser('AC30000002', 100);

    const req = new Request(`http://localhost/api/admin/users/${u.id}/points`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `admin-token=${token}` },
      body: JSON.stringify({ amount: -30, reason: 'penalty' }),
    });
    const res = await setPoints(req as any, { params: { id: u.id } });
    expect((await res.json()).data.balance_after).toBe(70);
  });

  it('rejects when result would be negative', async () => {
    const token = await adminToken();
    const u = await makeUser('AC30000003', 10);

    const req = new Request(`http://localhost/api/admin/users/${u.id}/points`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `admin-token=${token}` },
      body: JSON.stringify({ amount: -50, reason: 'too much' }),
    });
    const res = await setPoints(req as any, { params: { id: u.id } });
    expect((await res.json()).code).not.toBe(0);
  });
});

describe('PUT /api/admin/users/:id/ban', () => {
  it('toggles status', async () => {
    const token = await adminToken();
    const u = await makeUser('AC40000001', 0);

    let req = new Request(`http://localhost/api/admin/users/${u.id}/ban`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `admin-token=${token}` },
      body: JSON.stringify({ banned: true }),
    });
    let res = await banUser(req as any, { params: { id: u.id } });
    expect((await res.json()).data.status).toBe('banned');

    let updated = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(updated!.status).toBe('banned');

    req = new Request(`http://localhost/api/admin/users/${u.id}/ban`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: `admin-token=${token}` },
      body: JSON.stringify({ banned: false }),
    });
    res = await banUser(req as any, { params: { id: u.id } });
    updated = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(updated!.status).toBe('active');
  });
});
