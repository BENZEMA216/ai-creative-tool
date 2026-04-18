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
