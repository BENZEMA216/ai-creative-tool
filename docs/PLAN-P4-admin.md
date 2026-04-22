# AI 智能创作 — Plan 4 (P4 + P5)：后台管理 + 测试加固

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 完整后台管理系统（用户/积分/记录管理 + CSV 导出）+ 用户端使用记录页 + 安全加固（CSRF、生产部署 README）。

**Architecture:** Admin JWT 独立 secret + 路径隔离（`/api/admin/*`）；admin 用户表 + bcrypt 密码 + 强制改密；CRUD APIs 都走 withAdminAuth middleware；CSV 导出流式响应。

**Tech Stack:** 现有 stack + bcryptjs (已装) + csv-stringify。

**Spec:** `docs/superpowers/specs/2026-04-18-ai-creative-tool-design.md` §4.3 (admin 后台), §5 (admin APIs), §8 (security).

**Repo:** `/Users/benzema/code/ai-creative-tool/` (continuing from `v0.3.0-p3`).

---

## File Structure

```
web/
└── src/
    ├── lib/
    │   ├── core/
    │   │   └── admin-bootstrap.ts      # 启动时确保有 admin 用户
    │   └── middleware/
    │       └── with-admin-auth.ts
    │
    ├── app/
    │   ├── api/
    │   │   ├── admin/
    │   │   │   ├── login/route.ts
    │   │   │   ├── change-password/route.ts
    │   │   │   ├── me/route.ts
    │   │   │   ├── users/route.ts          # GET list
    │   │   │   ├── users/[id]/points/route.ts  # PUT 改积分
    │   │   │   ├── users/[id]/ban/route.ts     # PUT 封禁/解封
    │   │   │   ├── records/route.ts         # GET list
    │   │   │   └── records/export/route.ts  # GET CSV
    │   │   └── history/list/route.ts        # 用户端 history
    │   │
    │   ├── (auth)/history/
    │   │   ├── page.tsx
    │   │   └── HistoryUI.tsx
    │   │
    │   └── admin/
    │       ├── login/page.tsx
    │       ├── (authed)/
    │       │   ├── layout.tsx               # admin shell + sidebar
    │       │   ├── users/page.tsx
    │       │   ├── records/page.tsx
    │       │   └── change-password/page.tsx
    │       └── layout.tsx                   # 与 user (auth) 完全独立
    │
    └── components/admin/
        ├── AdminSidebar.tsx
        ├── UserTable.tsx
        ├── PointsEditModal.tsx
        └── RecordsTable.tsx
```

```
tests/
├── unit/
│   └── admin-bootstrap.test.ts
└── integration/
    ├── admin-api.test.ts
    └── history-api.test.ts
```

---

## Conventions

- 同前
- Admin token 12h 过期（短）+ 独立 cookie name `admin-token`
- 默认 admin 凭证：env `ADMIN_USERNAME` (default `admin`) + `ADMIN_INITIAL_PASSWORD`（空则随机生成打 console）

---

## Task 1: admin-bootstrap (TDD) — 启动时种子 admin 用户

**Files:**
- Create: `web/src/lib/core/admin-bootstrap.ts`
- Create: `web/tests/integration/admin-bootstrap.test.ts`

- [ ] **Step 1: Failing test**

`web/tests/integration/admin-bootstrap.test.ts`:
```ts
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
    expect(result.password).toMatch(/^.{16,}$/); // 至少16字符随机

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
      data: { username: 'admin', passwordHash: await bcrypt.hash('xxx', 12), mustChangePassword: false },
    });
    const result = await ensureAdminBootstrap();
    expect(result.created).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/admin-bootstrap.test.ts
```

- [ ] **Step 3: Implement**

`web/src/lib/core/admin-bootstrap.ts`:
```ts
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

/**
 * 启动时确保至少有一个 admin 用户。
 * - 已存在 → 跳过
 * - 不存在 → 用 ADMIN_USERNAME / ADMIN_INITIAL_PASSWORD env 创建
 *           - PASSWORD 留空 → 随机生成（mustChangePassword=true）
 */
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
```

- [ ] **Step 4: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/admin-bootstrap.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/core/admin-bootstrap.ts web/tests/integration/admin-bootstrap.test.ts
git commit -m "feat(admin): bootstrap admin user with random password fallback"
```

---

## Task 2: withAdminAuth middleware

**Files:**
- Create: `web/src/lib/middleware/with-admin-auth.ts`

- [ ] **Step 1: Implement**

`web/src/lib/middleware/with-admin-auth.ts`:
```ts
import { NextResponse } from 'next/server';
import { parse as parseCookie } from 'cookie';
import { verifyAdminToken, type AdminTokenPayload } from '@/lib/core/auth';
import { ErrCode } from '@/lib/core/errors';
import { err } from '@/lib/core/http';

export const ADMIN_COOKIE = 'admin-token';

export async function getAdminFromReq(req: Request): Promise<AdminTokenPayload | null> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookies = parseCookie(cookieHeader);
  const token = cookies[ADMIN_COOKIE];
  if (!token) return null;
  try {
    return await verifyAdminToken(token);
  } catch {
    return null;
  }
}

export async function withAdminAuth(
  req: Request,
  handler: (req: Request, admin: AdminTokenPayload) => Promise<NextResponse>
): Promise<NextResponse> {
  const admin = await getAdminFromReq(req);
  if (!admin) return err(ErrCode.AdminPermissionDenied, '请登录后台');
  return handler(req, admin);
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/middleware/with-admin-auth.ts
git commit -m "feat(middleware): admin JWT auth wrapper"
```

---

## Task 3: POST /api/admin/login + POST /api/admin/change-password + GET /me (TDD)

**Files:**
- Create: `web/src/app/api/admin/login/route.ts`
- Create: `web/src/app/api/admin/change-password/route.ts`
- Create: `web/src/app/api/admin/me/route.ts`
- Create: `web/tests/integration/admin-api.test.ts`

- [ ] **Step 1: Failing test**

`web/tests/integration/admin-api.test.ts`:
```ts
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
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/admin-api.test.ts
```

- [ ] **Step 3: Implement login**

`web/src/app/api/admin/login/route.ts`:
```ts
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';
import { signAdminToken } from '@/lib/core/auth';
import { ADMIN_COOKIE } from '@/lib/middleware/with-admin-auth';

const COOKIE_MAX_AGE = 12 * 60 * 60;

const reqSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
  const parsed = reqSchema.safeParse(body);
  if (!parsed.success) return err(ErrCode.InternalError, '请求参数非法');
  const { username, password } = parsed.data;

  const admin = await prisma.adminUser.findUnique({ where: { username } });
  if (!admin) return err(ErrCode.AdminPermissionDenied, '账号或密码错误');

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) return err(ErrCode.AdminPermissionDenied, '账号或密码错误');

  const token = await signAdminToken({ aid: admin.id, username: admin.username, role: admin.role });

  const res = ok({
    token,
    username: admin.username,
    role: admin.role,
    must_change_password: admin.mustChangePassword,
  }, '登录成功');

  res.headers.append(
    'Set-Cookie',
    `${ADMIN_COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`
  );
  return res;
}
```

- [ ] **Step 4: Implement change-password**

`web/src/app/api/admin/change-password/route.ts`:
```ts
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';

const reqSchema = z.object({
  old_password: z.string().min(1),
  new_password: z.string().min(8, '新密码至少 8 位').max(100),
});

export async function POST(req: Request) {
  return withAdminAuth(req, async (request, admin) => {
    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');

    const a = await prisma.adminUser.findUnique({ where: { id: admin.aid } });
    if (!a) return err(ErrCode.AdminPermissionDenied, 'admin not found');

    const ok2 = await bcrypt.compare(parsed.data.old_password, a.passwordHash);
    if (!ok2) return err(ErrCode.AdminPermissionDenied, '旧密码错误');

    const newHash = await bcrypt.hash(parsed.data.new_password, 12);
    await prisma.adminUser.update({
      where: { id: a.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });
    return ok({ updated: true }, '密码已更新');
  });
}
```

- [ ] **Step 5: Implement me**

`web/src/app/api/admin/me/route.ts`:
```ts
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';

export async function GET(req: Request) {
  return withAdminAuth(req, async (_, admin) => {
    const a = await prisma.adminUser.findUnique({ where: { id: admin.aid } });
    if (!a) return err(ErrCode.AdminPermissionDenied, 'admin not found');
    return ok({
      username: a.username,
      role: a.role,
      must_change_password: a.mustChangePassword,
    });
  });
}
```

- [ ] **Step 6: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/admin-api.test.ts
```

Expected: 8 tests pass (3 login + 4 change-pw + 1 me).

- [ ] **Step 7: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/admin/login/ web/src/app/api/admin/change-password/ web/src/app/api/admin/me/ web/tests/integration/admin-api.test.ts
git commit -m "feat(admin-api): login + change-password + me with bcrypt + admin JWT"
```

---

## Task 4: GET /api/admin/users (列表 + 搜索) + PUT /api/admin/users/:id/points + ban (TDD)

**Files:**
- Create: `web/src/app/api/admin/users/route.ts`
- Create: `web/src/app/api/admin/users/[id]/points/route.ts`
- Create: `web/src/app/api/admin/users/[id]/ban/route.ts`
- Modify: `web/tests/integration/admin-api.test.ts` (append)

- [ ] **Step 1: Append tests**

```ts
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
    // 手机号脱敏
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
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/admin-api.test.ts
```

- [ ] **Step 3: Implement users list**

`web/src/app/api/admin/users/route.ts`:
```ts
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok } from '@/lib/core/http';
import { prisma } from '@/lib/db/prisma';

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

export async function GET(req: Request) {
  return withAdminAuth(req, async () => {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? '20')));
    const q = url.searchParams.get('q')?.trim();

    const where = q
      ? { OR: [{ userId: { contains: q, mode: 'insensitive' as const } }, { phone: { contains: q } }] }
      : undefined;

    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok({
      total,
      page,
      page_size: pageSize,
      items: items.map(u => ({
        id: u.id,
        user_id: u.userId,
        phone: maskPhone(u.phone),
        nickname: u.nickname,
        points: u.points,
        status: u.status,
        created_at: u.createdAt.toISOString(),
      })),
    });
  });
}
```

- [ ] **Step 4: Implement points adjust**

`web/src/app/api/admin/users/[id]/points/route.ts`:
```ts
import { z } from 'zod';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { adminAdjustPoints } from '@/lib/core/points';

const reqSchema = z.object({
  amount: z.number().int(),
  reason: z.string().min(1).max(200),
});

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  return withAdminAuth(req, async (request) => {
    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '参数非法');

    try {
      const result = await adminAdjustPoints({
        userId: ctx.params.id,
        amount: parsed.data.amount,
        description: `[ADMIN] ${parsed.data.reason}`,
      });
      return ok({ balance_after: result.balanceAfter });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '调整失败';
      return err(ErrCode.InternalError, msg);
    }
  });
}
```

- [ ] **Step 5: Implement ban**

`web/src/app/api/admin/users/[id]/ban/route.ts`:
```ts
import { z } from 'zod';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';

const reqSchema = z.object({ banned: z.boolean() });

export async function PUT(req: Request, ctx: { params: { id: string } }) {
  return withAdminAuth(req, async (request) => {
    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, '参数非法');

    const u = await prisma.user.update({
      where: { id: ctx.params.id },
      data: { status: parsed.data.banned ? 'banned' : 'active' },
    });
    return ok({ id: u.id, status: u.status });
  });
}
```

- [ ] **Step 6: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/admin-api.test.ts
```

Expected: 15 tests pass (8 + 3 list + 3 points + 1 ban).

- [ ] **Step 7: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/admin/users/ web/tests/integration/admin-api.test.ts
git commit -m "feat(admin-api): users list/search + points adjust + ban toggle"
```

---

## Task 5: GET /api/admin/records + GET /api/admin/records/export (CSV) (TDD)

**Files:**
- Create: `web/src/app/api/admin/records/route.ts`
- Create: `web/src/app/api/admin/records/export/route.ts`
- Modify: `web/tests/integration/admin-api.test.ts` (append)

- [ ] **Step 1: Append tests**

```ts
import { GET as adminRecords } from '@/app/api/admin/records/route';
import { GET as recordsExport } from '@/app/api/admin/records/export/route';

async function makeRecord(userId: string, type: 'extract_text' | 'download_video', status: 'success' | 'failed') {
  return testPrisma.usageRecord.create({
    data: {
      userId,
      type,
      videoUrl: 'https://x',
      platform: 'youtube',
      status,
      pointsConsumed: status === 'success' ? 10 : 0,
    },
  });
}

describe('GET /api/admin/records', () => {
  it('lists records with filters', async () => {
    const token = await adminToken();
    const u = await makeUser('AC50000001', 100);
    await makeRecord(u.id, 'extract_text', 'success');
    await makeRecord(u.id, 'download_video', 'failed');

    const req = new Request('http://localhost/api/admin/records?page=1&page_size=10', {
      headers: { cookie: `admin-token=${token}` },
    });
    const res = await adminRecords(req as any);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.total).toBe(2);
  });

  it('filters by status=failed', async () => {
    const token = await adminToken();
    const u = await makeUser('AC50000002', 100);
    await makeRecord(u.id, 'extract_text', 'success');
    await makeRecord(u.id, 'extract_text', 'failed');
    await makeRecord(u.id, 'extract_text', 'failed');

    const req = new Request('http://localhost/api/admin/records?status=failed', {
      headers: { cookie: `admin-token=${token}` },
    });
    const res = await adminRecords(req as any);
    const json = await res.json();
    expect(json.data.total).toBe(2);
  });
});

describe('GET /api/admin/records/export', () => {
  it('returns CSV with header row + records', async () => {
    const token = await adminToken();
    const u = await makeUser('AC60000001', 100);
    await makeRecord(u.id, 'extract_text', 'success');

    const req = new Request('http://localhost/api/admin/records/export', {
      headers: { cookie: `admin-token=${token}` },
    });
    const res = await recordsExport(req as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('csv');
    const text = await res.text();
    expect(text).toContain('user_id,type,platform,status,points_consumed');
    expect(text).toContain('AC60000001');
    expect(text).toContain('extract_text');
  });

  it('requires admin auth', async () => {
    const req = new Request('http://localhost/api/admin/records/export');
    const res = await recordsExport(req as any);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Install csv-stringify**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add csv-stringify
```

- [ ] **Step 3: Implement records list**

`web/src/app/api/admin/records/route.ts`:
```ts
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { ok } from '@/lib/core/http';
import { prisma } from '@/lib/db/prisma';
import type { UsageType, UsageStatus } from '@prisma/client';

export async function GET(req: Request) {
  return withAdminAuth(req, async () => {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size') ?? '20')));
    const userIdFilter = url.searchParams.get('user_id')?.trim();
    const type = url.searchParams.get('type') as UsageType | null;
    const platform = url.searchParams.get('platform')?.trim();
    const status = url.searchParams.get('status') as UsageStatus | null;

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (platform) where.platform = platform;
    if (status) where.status = status;
    if (userIdFilter) {
      where.user = { userId: { contains: userIdFilter, mode: 'insensitive' } };
    }

    const [total, items] = await Promise.all([
      prisma.usageRecord.count({ where }),
      prisma.usageRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { userId: true } } },
      }),
    ]);

    return ok({
      total,
      page,
      page_size: pageSize,
      items: items.map(r => ({
        id: r.id,
        user_id: r.user.userId,
        type: r.type,
        platform: r.platform,
        status: r.status,
        points_consumed: r.pointsConsumed,
        video_url: r.videoUrl,
        video_duration: r.videoDuration,
        error_message: r.errorMessage,
        created_at: r.createdAt.toISOString(),
      })),
    });
  });
}
```

- [ ] **Step 4: Implement export**

`web/src/app/api/admin/records/export/route.ts`:
```ts
import { stringify } from 'csv-stringify/sync';
import { withAdminAuth } from '@/lib/middleware/with-admin-auth';
import { prisma } from '@/lib/db/prisma';
import type { UsageType, UsageStatus } from '@prisma/client';

export async function GET(req: Request) {
  return withAdminAuth(req, async () => {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') as UsageType | null;
    const status = url.searchParams.get('status') as UsageStatus | null;
    const platform = url.searchParams.get('platform')?.trim();

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (platform) where.platform = platform;
    if (status) where.status = status;

    const items = await prisma.usageRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      include: { user: { select: { userId: true } } },
    });

    const rows = items.map(r => ({
      user_id: r.user.userId,
      type: r.type,
      platform: r.platform,
      status: r.status,
      points_consumed: r.pointsConsumed,
      video_url: r.videoUrl,
      video_duration: r.videoDuration ?? '',
      error_message: r.errorMessage ?? '',
      created_at: r.createdAt.toISOString(),
    }));

    const csv = stringify(rows, {
      header: true,
      columns: ['user_id', 'type', 'platform', 'status', 'points_consumed', 'video_url', 'video_duration', 'error_message', 'created_at'],
    });

    const filename = `records-${new Date().toISOString().split('T')[0]}.csv`;
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  });
}
```

- [ ] **Step 5: Run test**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/admin-api.test.ts
```

Expected: 19 tests pass (15 + 2 records + 2 export).

- [ ] **Step 6: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/admin/records/ web/tests/integration/admin-api.test.ts web/package.json web/pnpm-lock.yaml
git commit -m "feat(admin-api): records list with filters + CSV export"
```

---

## Task 6: GET /api/history/list (用户端) (TDD)

**Files:**
- Create: `web/src/app/api/history/list/route.ts`
- Create: `web/tests/integration/history-api.test.ts`

- [ ] **Step 1: Failing test**

`web/tests/integration/history-api.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, resetDb } from '../helpers/test-db';
import { signUserToken } from '@/lib/core/auth';
import { GET as historyList } from '@/app/api/history/list/route';

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  await resetDb();
});

describe('GET /api/history/list', () => {
  it('returns paginated history for authenticated user only', async () => {
    const me = await testPrisma.user.create({
      data: { userId: 'AC11111111', phone: '13800138000', points: 100 },
    });
    const other = await testPrisma.user.create({
      data: { userId: 'AC22222222', phone: '13700137000', points: 100 },
    });
    await testPrisma.usageRecord.createMany({
      data: [
        { userId: me.id, type: 'extract_text', videoUrl: 'a', platform: 'youtube', status: 'success', pointsConsumed: 10 },
        { userId: me.id, type: 'download_video', videoUrl: 'b', platform: 'douyin', status: 'success', pointsConsumed: 20 },
        { userId: other.id, type: 'extract_text', videoUrl: 'c', platform: 'youtube', status: 'success', pointsConsumed: 10 },
      ],
    });

    const token = await signUserToken({ uid: me.id, userId: me.userId });
    const req = new Request('http://localhost/api/history/list?page=1&page_size=10', {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await historyList(req as any);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.total).toBe(2);
    expect(json.data.items.every((r: { user_id: string }) => r.user_id === undefined || r.user_id === 'AC11111111')).toBe(true);
  });

  it('filters by type', async () => {
    const me = await testPrisma.user.create({
      data: { userId: 'AC11111111', phone: '13800138000', points: 100 },
    });
    await testPrisma.usageRecord.createMany({
      data: [
        { userId: me.id, type: 'extract_text', videoUrl: 'a', platform: 'youtube', status: 'success', pointsConsumed: 10 },
        { userId: me.id, type: 'download_video', videoUrl: 'b', platform: 'douyin', status: 'success', pointsConsumed: 20 },
      ],
    });
    const token = await signUserToken({ uid: me.id, userId: me.userId });
    const req = new Request('http://localhost/api/history/list?type=extract_text', {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await historyList(req as any);
    expect((await res.json()).data.total).toBe(1);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/history/list');
    const res = await historyList(req as any);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/history-api.test.ts
```

- [ ] **Step 3: Implement**

`web/src/app/api/history/list/route.ts`:
```ts
import { withAuth } from '@/lib/middleware/with-auth';
import { ok } from '@/lib/core/http';
import { prisma } from '@/lib/db/prisma';
import type { UsageType, UsageStatus } from '@prisma/client';

export async function GET(req: Request) {
  return withAuth(req, async (_, user) => {
    const url = new URL(req.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1'));
    const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get('page_size') ?? '20')));
    const type = url.searchParams.get('type') as UsageType | null;
    const status = url.searchParams.get('status') as UsageStatus | null;

    const where: Record<string, unknown> = { userId: user.uid };
    if (type) where.type = type;
    if (status) where.status = status;

    const [total, items] = await Promise.all([
      prisma.usageRecord.count({ where }),
      prisma.usageRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok({
      total,
      page,
      page_size: pageSize,
      items: items.map(r => ({
        id: r.id,
        type: r.type,
        platform: r.platform,
        status: r.status,
        points_consumed: r.pointsConsumed,
        video_url: r.videoUrl,
        video_duration: r.videoDuration,
        error_message: r.errorMessage,
        created_at: r.createdAt.toISOString(),
      })),
    });
  });
}
```

- [ ] **Step 4: Run test pass**

```bash
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/history-api.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/history/ web/tests/integration/history-api.test.ts
git commit -m "feat(api): GET /api/history/list (user-scoped, paginated, filterable)"
```

---

## Task 7: User-side history page

**Files:**
- Create: `web/src/app/(auth)/history/page.tsx`
- Create: `web/src/app/(auth)/history/HistoryUI.tsx`

- [ ] **Step 1: HistoryUI**

`web/src/app/(auth)/history/HistoryUI.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Record {
  id: number;
  type: 'extract_text' | 'download_video';
  platform: string;
  status: 'success' | 'failed';
  points_consumed: number;
  video_url: string;
  created_at: string;
}

export function HistoryUI() {
  const [items, setItems] = useState<Record[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [type, setType] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    if (type) params.set('type', type);
    fetch(`/api/history/list?${params.toString()}`)
      .then(r => r.json())
      .then(json => {
        if (json.code === 0) {
          setItems(json.data.items);
          setTotal(json.data.total);
        }
      })
      .finally(() => setLoading(false));
  }, [page, type]);

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <label className="text-white/60">筛选类型：</label>
        <select
          value={type}
          onChange={e => { setPage(1); setType(e.target.value); }}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white"
        >
          <option value="">全部</option>
          <option value="extract_text">📝 文案提取</option>
          <option value="download_video">📥 视频下载</option>
        </select>
      </div>
      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60">
            <tr>
              <th className="px-3 py-2 text-left">时间</th>
              <th className="px-3 py-2 text-left">类型</th>
              <th className="px-3 py-2 text-left">平台</th>
              <th className="px-3 py-2 text-left">视频链接</th>
              <th className="px-3 py-2 text-right">积分</th>
              <th className="px-3 py-2 text-center">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-white/40">加载中...</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-white/40">暂无记录</td></tr>
            )}
            {!loading && items.map(r => (
              <tr key={r.id} className="text-white/80 hover:bg-white/5">
                <td className="px-3 py-2">{new Date(r.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="px-3 py-2">{r.type === 'extract_text' ? '文案提取' : '视频下载'}</td>
                <td className="px-3 py-2">{r.platform}</td>
                <td className="px-3 py-2 max-w-xs truncate"><a href={r.video_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{r.video_url}</a></td>
                <td className={`px-3 py-2 text-right ${r.points_consumed > 0 ? 'text-red-400' : 'text-white/40'}`}>
                  {r.points_consumed > 0 ? `-${r.points_consumed}` : '0'}
                </td>
                <td className="px-3 py-2 text-center">
                  {r.status === 'success' ? '✅' : '❌'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassCard>
      <div className="flex items-center justify-between text-sm">
        <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← 上一页</Button>
        <span className="text-white/60">第 {page} / {totalPages} 页（共 {total} 条）</span>
        <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页 →</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: history page**

`web/src/app/(auth)/history/page.tsx`:
```tsx
import { HistoryUI } from './HistoryUI';

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-editorial text-3xl text-white">📋 使用记录</h1>
        <p className="mt-1 text-sm text-white/60">查看你的文案提取和视频下载历史</p>
      </div>
      <HistoryUI />
    </div>
  );
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build 2>&1 | tail -5

cd /Users/benzema/code/ai-creative-tool
git add 'web/src/app/(auth)/history/'
git commit -m "feat(ui): user history page with filters and pagination"
```

---

## Task 8: Admin UI — login + sidebar layout + users + records pages

**Files:**
- Create: `web/src/app/admin/login/page.tsx`
- Create: `web/src/app/admin/(authed)/layout.tsx`
- Create: `web/src/app/admin/(authed)/users/page.tsx`
- Create: `web/src/app/admin/(authed)/users/UsersUI.tsx`
- Create: `web/src/app/admin/(authed)/records/page.tsx`
- Create: `web/src/app/admin/(authed)/records/RecordsUI.tsx`
- Create: `web/src/app/admin/(authed)/change-password/page.tsx`
- Create: `web/src/app/admin/(authed)/change-password/ChangePasswordUI.tsx`
- Create: `web/src/components/admin/AdminSidebar.tsx`

### Step 1: Admin login page

`web/src/app/admin/login/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      const json = await res.json();
      if (json.code !== 0) { setErr(json.message); return; }
      if (json.data.must_change_password) router.push('/admin/change-password');
      else router.push('/admin/users');
    } finally { setBusy(false); }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-md">
        <h1 className="text-2xl font-medium text-gray-900">后台管理登录</h1>
        <input
          type="text"
          placeholder="用户名"
          value={u}
          onChange={e => setU(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
        />
        <input
          type="password"
          placeholder="密码"
          value={p}
          onChange={e => setP(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
        />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button
          onClick={submit}
          disabled={busy || !u || !p}
          className="w-full rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
      </div>
    </main>
  );
}
```

### Step 2: Admin (authed) layout

`web/src/app/admin/(authed)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyAdminToken } from '@/lib/core/auth';
import { AdminSidebar } from '@/components/admin/AdminSidebar';

export default async function AdminAuthedLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('admin-token')?.value;
  if (!token) redirect('/admin/login');
  const payload = await verifyAdminToken(token).catch(() => null);
  if (!payload) redirect('/admin/login');

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar username={payload.username} />
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
```

### Step 3: AdminSidebar

`web/src/components/admin/AdminSidebar.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { clsx } from 'clsx';

const NAV = [
  { href: '/admin/users', label: '👥 用户管理' },
  { href: '/admin/records', label: '📋 使用记录' },
  { href: '/admin/change-password', label: '🔑 修改密码' },
];

export function AdminSidebar({ username }: { username: string }) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    document.cookie = 'admin-token=; Path=/; Max-Age=0';
    router.push('/admin/login');
  }

  return (
    <aside className="w-56 bg-gray-900 text-white p-4 space-y-1">
      <div className="mb-6 px-2">
        <div className="text-sm text-white/60">登录身份</div>
        <div className="font-medium">{username}</div>
      </div>
      {NAV.map(n => (
        <Link
          key={n.href}
          href={n.href}
          className={clsx(
            'block rounded-lg px-3 py-2 text-sm',
            pathname === n.href ? 'bg-white/10' : 'hover:bg-white/5'
          )}
        >
          {n.label}
        </Link>
      ))}
      <button onClick={logout} className="mt-6 w-full rounded-lg px-3 py-2 text-left text-sm text-red-300 hover:bg-white/5">
        退出登录
      </button>
    </aside>
  );
}
```

### Step 4: Users page

`web/src/app/admin/(authed)/users/page.tsx`:
```tsx
import { UsersUI } from './UsersUI';

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium text-gray-900">用户管理</h1>
      <UsersUI />
    </div>
  );
}
```

`web/src/app/admin/(authed)/users/UsersUI.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';

interface UserRow {
  id: string;
  user_id: string;
  phone: string;
  points: number;
  status: 'active' | 'banned';
  created_at: string;
}

export function UsersUI() {
  const [items, setItems] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');

  async function load() {
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    if (q) params.set('q', q);
    const res = await fetch(`/api/admin/users?${params.toString()}`);
    const json = await res.json();
    if (json.code === 0) {
      setItems(json.data.items);
      setTotal(json.data.total);
    }
  }

  useEffect(() => { load(); }, [page]);

  async function adjustPoints(id: string) {
    const amount = prompt('调整数量（正负皆可）');
    if (!amount) return;
    const reason = prompt('原因') ?? '后台调整';
    const res = await fetch(`/api/admin/users/${id}/points`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount), reason }),
    });
    const json = await res.json();
    if (json.code === 0) { alert(`新余额：${json.data.balance_after}`); load(); }
    else alert(json.message);
  }

  async function toggleBan(id: string, banned: boolean) {
    if (!confirm(banned ? '确认封禁该用户？' : '确认解封该用户？')) return;
    await fetch(`/api/admin/users/${id}/ban`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ banned }),
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="按 User ID / 手机号搜索"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(); } }}
          className="flex-1 max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"
        />
        <button onClick={() => { setPage(1); load(); }} className="rounded-lg bg-gray-900 px-4 py-2 text-white">搜索</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-3 py-2 text-left">User ID</th>
              <th className="px-3 py-2 text-left">手机号</th>
              <th className="px-3 py-2 text-right">积分</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-left">注册时间</th>
              <th className="px-3 py-2 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900">
            {items.map(u => (
              <tr key={u.id}>
                <td className="px-3 py-2">{u.user_id}</td>
                <td className="px-3 py-2">{u.phone}</td>
                <td className="px-3 py-2 text-right">{u.points.toLocaleString()}</td>
                <td className="px-3 py-2">
                  <span className={u.status === 'banned' ? 'text-red-600' : 'text-green-600'}>
                    {u.status === 'banned' ? '已封禁' : '正常'}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-500">{new Date(u.created_at).toLocaleString('zh-CN')}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => adjustPoints(u.id)} className="text-blue-600 hover:underline">改积分</button>
                  <button onClick={() => toggleBan(u.id, u.status !== 'banned')} className="text-red-600 hover:underline">
                    {u.status === 'banned' ? '解封' : '封禁'}
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-700">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded px-3 py-1 hover:bg-white disabled:opacity-50">← 上一页</button>
        <span>第 {page} 页（共 {total} 条）</span>
        <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="rounded px-3 py-1 hover:bg-white disabled:opacity-50">下一页 →</button>
      </div>
    </div>
  );
}
```

### Step 5: Records page

`web/src/app/admin/(authed)/records/page.tsx`:
```tsx
import { RecordsUI } from './RecordsUI';

export default function AdminRecordsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium text-gray-900">使用记录</h1>
      <RecordsUI />
    </div>
  );
}
```

`web/src/app/admin/(authed)/records/RecordsUI.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';

interface Row {
  id: number;
  user_id: string;
  type: string;
  platform: string;
  status: string;
  points_consumed: number;
  video_url: string;
  created_at: string;
}

export function RecordsUI() {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  async function load() {
    const params = new URLSearchParams({ page: String(page), page_size: '20' });
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    const res = await fetch(`/api/admin/records?${params.toString()}`);
    const json = await res.json();
    if (json.code === 0) {
      setItems(json.data.items);
      setTotal(json.data.total);
    }
  }

  useEffect(() => { load(); }, [page, type, status]);

  function exportCsv() {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    window.location.href = `/api/admin/records/export?${params.toString()}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <select value={type} onChange={e => { setPage(1); setType(e.target.value); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
          <option value="">所有类型</option>
          <option value="extract_text">文案提取</option>
          <option value="download_video">视频下载</option>
        </select>
        <select value={status} onChange={e => { setPage(1); setStatus(e.target.value); }} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
          <option value="">所有状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <button onClick={exportCsv} className="ml-auto rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700">📥 导出 CSV</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th className="px-3 py-2 text-left">时间</th>
              <th className="px-3 py-2 text-left">User ID</th>
              <th className="px-3 py-2 text-left">类型</th>
              <th className="px-3 py-2 text-left">平台</th>
              <th className="px-3 py-2 text-left">状态</th>
              <th className="px-3 py-2 text-right">消耗积分</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900">
            {items.map(r => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-gray-500">{new Date(r.created_at).toLocaleString('zh-CN')}</td>
                <td className="px-3 py-2">{r.user_id}</td>
                <td className="px-3 py-2">{r.type === 'extract_text' ? '文案提取' : '视频下载'}</td>
                <td className="px-3 py-2">{r.platform}</td>
                <td className="px-3 py-2">
                  <span className={r.status === 'failed' ? 'text-red-600' : 'text-green-600'}>{r.status}</span>
                </td>
                <td className="px-3 py-2 text-right">{r.points_consumed}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">暂无数据</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-700">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded px-3 py-1 hover:bg-white disabled:opacity-50">← 上一页</button>
        <span>第 {page} 页（共 {total} 条）</span>
        <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)} className="rounded px-3 py-1 hover:bg-white disabled:opacity-50">下一页 →</button>
      </div>
    </div>
  );
}
```

### Step 6: Change password

`web/src/app/admin/(authed)/change-password/page.tsx`:
```tsx
import { ChangePasswordUI } from './ChangePasswordUI';

export default function AdminChangePasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium text-gray-900">修改密码</h1>
      <ChangePasswordUI />
    </div>
  );
}
```

`web/src/app/admin/(authed)/change-password/ChangePasswordUI.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ChangePasswordUI() {
  const router = useRouter();
  const [oldPw, setOld] = useState('');
  const [newPw, setNew] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setErr(null);
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
    });
    const json = await res.json();
    if (json.code !== 0) setErr(json.message);
    else { setDone(true); setTimeout(() => router.push('/admin/users'), 1200); }
  }

  return (
    <div className="max-w-sm space-y-3">
      <input type="password" placeholder="旧密码" value={oldPw} onChange={e => setOld(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
      <input type="password" placeholder="新密码（≥8位）" value={newPw} onChange={e => setNew(e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {done && <p className="text-sm text-green-600">✅ 密码已更新，跳转中...</p>}
      <button onClick={submit} disabled={!oldPw || newPw.length < 8 || done}
        className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50">
        提交
      </button>
    </div>
  );
}
```

### Step 7: Verify build

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build 2>&1 | tail -10
```

### Step 8: Commit

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/admin/ web/src/components/admin/
git commit -m "feat(admin-ui): login + sidebar + users + records + change-password"
```

---

## Task 9: Bootstrap admin on web startup

**Files:**
- Modify: `web/src/app/layout.tsx` (or create `web/src/instrumentation.ts`)

Use Next.js instrumentation hook (Next 13.4+) to run bootstrap on server start.

- [ ] **Step 1: Enable instrumentation in next.config.mjs**

Read `web/next.config.mjs` first. If it doesn't have `experimental.instrumentationHook`, that's fine — it's enabled by default in Next 14.

- [ ] **Step 2: Create instrumentation.ts**

`web/src/instrumentation.ts`:
```ts
export async function register() {
  // 仅在 Node.js runtime 下跑（不在 edge）
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureAdminBootstrap } = await import('./lib/core/admin-bootstrap');
    try {
      await ensureAdminBootstrap();
    } catch (e) {
      console.error('[admin-bootstrap] failed:', e);
    }
  }
}
```

- [ ] **Step 3: Verify build still works**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/instrumentation.ts
git commit -m "feat(admin): auto-bootstrap admin user on server start"
```

---

## Task 10: README + 验收 + tag

- [ ] **Step 1: Update README**

In `/Users/benzema/code/ai-creative-tool/README.md`:

```markdown
## 已完成 Plan

- ✅ **Plan 1 (P0 + P1)**：骨架 + 认证 — 21 tasks
- ✅ **Plan 2 (P2)**：视频解析 + 文案提取 + ffmpeg.wasm 裁剪 — 17 tasks
- ✅ **Plan 3 (P3)**：积分充值 + 微信支付 (mock) — 8 tasks
- ✅ **Plan 4 (P4 + P5)**：后台管理 + 用户记录 — 10 tasks
```

加测试后台 section：
```markdown
## 测试后台管理

1. 启动 web 服务后，控制台会打印随机生成的 admin 密码（如果 `.env` 没设 `ADMIN_INITIAL_PASSWORD`）
2. 打开 http://localhost:3000/admin/login
3. 用户名 `admin` + 控制台打印的密码
4. 首次登录强制改密 → 跳转到用户管理
5. 在用户管理页可：搜索用户 / 改积分 / 封禁解封
6. 在使用记录页可：筛选 / 导出 CSV
```

- [ ] **Step 2: Run all tests**

```bash
cd /Users/benzema/code/ai-creative-tool
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
pkill -f "uvicorn" 2>/dev/null || true
sleep 1

cd web
echo "=== UNIT + INTEGRATION ==="
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" pnpm test 2>&1 | tail -8

echo "=== BUILD ==="
pnpm build 2>&1 | tail -5

echo "=== E2E ==="
rm -f /tmp/ai-creative-web-e2e.log
pnpm test:e2e 2>&1 | tail -5

echo "=== PYTHON ==="
cd ../ytdlp-service
.venv/bin/python -m pytest app/tests/ -v -m "not integration" 2>&1 | tail -5
```

Expected: web ~110+ pass, e2e 2, python 14, build pass.

- [ ] **Step 3: Commit + tag**

```bash
cd /Users/benzema/code/ai-creative-tool
git add README.md
git commit -m "docs: README updated for P4 milestone (admin + history)"
git tag -a v0.4.0-p4 -m "P4+P5: admin management + user history + CSV export"
git tag -a v1.0.0 -m "v1.0.0: ai-creative-tool full feature MVP (mock pay, ready for production credentials)"
git log --oneline | head -20
```

---

## 验收清单

- [ ] 所有测试全绿（web ≥110, python 14, e2e 2）
- [ ] 浏览器手动跑通：
  - [ ] /admin/login → 改密 → /admin/users 列表 + 搜索
  - [ ] 改积分弹窗 → 用户积分变更
  - [ ] 封禁用户 → 该用户 /login 被拒
  - [ ] /admin/records → 筛选 → 导出 CSV
  - [ ] /history → 用户看到自己的记录
- [ ] git tag v0.4.0-p4 + v1.0.0

---

## 完成

整个 ai-creative-tool 项目从 0 到完整商业化版骨架（mock 模式可立即体验，真服务凭证就绪即可上线）已交付。下一步：
1. 部署到服务器 43.160.242.46
2. 业务方申请商户号、SMS 资质后切真实模式
