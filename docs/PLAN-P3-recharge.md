# AI 智能创作 — Plan 3 (P3)：积分充值 + 微信支付

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** 完整实现充值积分功能。3 档套餐（19.9 / 39.9 / 99.9 元）→ 微信 Native API 下单 → 二维码 → 用户扫码 → 微信回调 → 积分到账 → 流水记录。Mock 支付模式 5 秒后自动"成功"以便本地测试。

**Architecture:** Pay client 双轨抽象（mock / wechat-v3）；订单状态机（pending → paid/expired/refunded）；微信回调用 HMAC 签名校验 + 状态机幂等保证；Native 支付返回二维码 URL；前端轮询订单状态。

**Tech Stack:** Next.js API + Prisma 6 + 现有 stack；微信支付走 raw HTTP V3 (避免重 SDK)；mock 模式用 setTimeout + setImmediate 异步触发回调。

**Spec:** `docs/superpowers/specs/2026-04-18-ai-creative-tool-design.md` §3.2 (订单), §5.2 (Pay client), §6.3 (订单状态机).

**Repo:** `/Users/benzema/code/ai-creative-tool/` (continuing from `v0.2.0-p2`).

---

## File Structure (Plan 3 全部产出)

```
web/
└── src/
    ├── lib/
    │   ├── core/
    │   │   ├── orders.ts             # 套餐常量 + 状态机 helpers
    │   │   └── order-no.ts           # 订单号生成
    │   └── clients/
    │       └── pay/
    │           ├── interface.ts
    │           ├── mock.ts
    │           ├── wechat.ts          # 真接入 (V3 Native)
    │           └── index.ts
    │
    ├── app/
    │   ├── api/
    │   │   └── order/
    │   │       ├── create/route.ts
    │   │       ├── status/[id]/route.ts
    │   │       └── wechat-callback/route.ts
    │   └── (auth)/recharge/
    │       ├── page.tsx
    │       └── RechargeUI.tsx
    │
    └── components/
        └── features/
            ├── PackageCard.tsx
            └── PaymentModal.tsx
```

```
tests/
├── unit/
│   ├── order-no.test.ts
│   ├── orders.test.ts                 # 状态机 + 套餐
│   └── pay-mock.test.ts
└── integration/
    └── order-api.test.ts
```

---

## Conventions

- 同 Plan 2
- 所有支付相关测试默认 `MOCK_PAY=true`，真实微信测试需要商户号（不在本 plan 内）
- 订单号格式：`AC` + 14 位时间戳 + 4 位随机 = 20 字符

---

## Task 1: order-no generator (TDD)

**Files:**
- Create: `web/tests/unit/order-no.test.ts`
- Create: `web/src/lib/core/order-no.ts`

- [ ] **Step 1: Failing test**

`web/tests/unit/order-no.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateOrderNo, isValidOrderNo } from '@/lib/core/order-no';

describe('generateOrderNo', () => {
  it('returns AC + 14 digits + 4 alnum', () => {
    const no = generateOrderNo();
    expect(no).toMatch(/^AC\d{14}[A-Z0-9]{4}$/);
    expect(no.length).toBe(20);
  });

  it('produces different IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 50; i++) ids.add(generateOrderNo());
    expect(ids.size).toBe(50);
  });
});

describe('isValidOrderNo', () => {
  it('accepts our format', () => {
    expect(isValidOrderNo('AC20260418123456ABCD')).toBe(true);
  });
  it('rejects bad format', () => {
    expect(isValidOrderNo('xx20260418123456ABCD')).toBe(false);
    expect(isValidOrderNo('AC2026041812345')).toBe(false);
    expect(isValidOrderNo('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/order-no.test.ts
```

- [ ] **Step 3: Implement**

`web/src/lib/core/order-no.ts`:
```ts
import { randomBytes } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符

export function generateOrderNo(): string {
  const now = new Date();
  const ts =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
  const buf = randomBytes(4);
  let suffix = '';
  for (let i = 0; i < 4; i++) suffix += ALPHABET[buf[i] % ALPHABET.length];
  return `AC${ts}${suffix}`;
}

export function isValidOrderNo(s: string): boolean {
  return /^AC\d{14}[A-Z0-9]{4}$/.test(s);
}
```

- [ ] **Step 4: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/order-no.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/core/order-no.ts web/tests/unit/order-no.test.ts
git commit -m "feat(core): order-no generator (AC + timestamp + suffix)"
```

---

## Task 2: orders core (packages + state machine helpers, TDD)

**Files:**
- Create: `web/tests/unit/orders.test.ts`
- Create: `web/src/lib/core/orders.ts`

- [ ] **Step 1: Failing test**

`web/tests/unit/orders.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PACKAGES, getPackageInfo, isValidPackageType } from '@/lib/core/orders';

describe('PACKAGES', () => {
  it('has basic / standard / premium with correct values', () => {
    expect(PACKAGES.basic).toEqual({ yuan: 19.9, points: 2000 });
    expect(PACKAGES.standard).toEqual({ yuan: 39.9, points: 5000 });
    expect(PACKAGES.premium).toEqual({ yuan: 99.9, points: 12000 });
  });
});

describe('getPackageInfo', () => {
  it('returns the package by type', () => {
    const p = getPackageInfo('standard');
    expect(p.yuan).toBe(39.9);
    expect(p.points).toBe(5000);
  });
  it('throws on unknown type', () => {
    expect(() => getPackageInfo('foo' as any)).toThrow();
  });
});

describe('isValidPackageType', () => {
  it('accepts valid types', () => {
    expect(isValidPackageType('basic')).toBe(true);
    expect(isValidPackageType('standard')).toBe(true);
    expect(isValidPackageType('premium')).toBe(true);
  });
  it('rejects others', () => {
    expect(isValidPackageType('foo')).toBe(false);
    expect(isValidPackageType('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/orders.test.ts
```

- [ ] **Step 3: Implement**

`web/src/lib/core/orders.ts`:
```ts
import type { PackageType } from '@prisma/client';

export const PACKAGES = {
  basic:    { yuan: 19.9, points: 2000 },
  standard: { yuan: 39.9, points: 5000 },
  premium:  { yuan: 99.9, points: 12000 },
} as const;

export function isValidPackageType(s: string): s is PackageType {
  return s === 'basic' || s === 'standard' || s === 'premium';
}

export function getPackageInfo(type: PackageType): { yuan: number; points: number } {
  if (!isValidPackageType(type)) throw new Error(`unknown package type: ${type}`);
  return PACKAGES[type];
}

export const ORDER_EXPIRY_MS = 15 * 60 * 1000; // 15 min
```

- [ ] **Step 4: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/orders.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/core/orders.ts web/tests/unit/orders.test.ts
git commit -m "feat(core): order packages (basic/standard/premium) + helpers"
```

---

## Task 3: Pay client (interface + mock + wechat stub) (TDD)

**Files:**
- Create: `web/tests/unit/pay-mock.test.ts`
- Create: `web/src/lib/clients/pay/interface.ts`
- Create: `web/src/lib/clients/pay/mock.ts`
- Create: `web/src/lib/clients/pay/wechat.ts`
- Create: `web/src/lib/clients/pay/index.ts`

- [ ] **Step 1: Failing test**

`web/tests/unit/pay-mock.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('MockPayClient', () => {
  it('returns a fake QR code URL', async () => {
    const { MockPayClient } = await import('@/lib/clients/pay/mock');
    const client = new MockPayClient();
    const result = await client.createNativeOrder({
      orderNo: 'AC20260418123456ABCD',
      amountYuan: 39.9,
      description: 'standard',
      notifyUrl: 'http://localhost/api/order/wechat-callback',
    });
    expect(result.qrCodeUrl).toContain('mock');
    expect(result.prepayId).toBeTruthy();
  });

  it('verifyCallback returns success for any well-formed body', async () => {
    const { MockPayClient } = await import('@/lib/clients/pay/mock');
    const client = new MockPayClient();
    const r = client.verifyCallback({}, { order_no: 'AC20260418123456ABCD', success: true });
    expect(r.orderNo).toBe('AC20260418123456ABCD');
    expect(r.success).toBe(true);
  });
});

describe('Pay factory', () => {
  beforeEach(async () => {
    const mod = await import('@/lib/clients/pay');
    mod._resetPayClient();
  });

  it('returns mock when MOCK_PAY=true', async () => {
    process.env.MOCK_PAY = 'true';
    const mod = await import('@/lib/clients/pay');
    mod._resetPayClient();
    const c = mod.getPayClient();
    expect(c.constructor.name).toBe('MockPayClient');
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/pay-mock.test.ts
```

- [ ] **Step 3: Implement**

`web/src/lib/clients/pay/interface.ts`:
```ts
export interface CreateOrderInput {
  orderNo: string;
  amountYuan: number;
  description: string;
  notifyUrl: string;
}

export interface CreateOrderResult {
  qrCodeUrl: string;     // weixin://wxpay/bizpayurl?pr=xxx 或 mock URL
  prepayId: string;
}

export interface VerifiedCallback {
  orderNo: string;
  success: boolean;
}

export interface PayClient {
  createNativeOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  /**
   * 校验微信回调签名（mock 总是返回 success）
   * @param headers HTTP 请求头（含 Wechatpay-Signature 等）
   * @param body 已 parse 的 JSON body
   */
  verifyCallback(headers: Record<string, string | undefined>, body: unknown): VerifiedCallback;
}
```

`web/src/lib/clients/pay/mock.ts`:
```ts
import type { PayClient, CreateOrderInput, CreateOrderResult, VerifiedCallback } from './interface';

export class MockPayClient implements PayClient {
  async createNativeOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    // 5 秒后自动模拟微信回调
    setTimeout(() => {
      // notifyUrl 是相对路径或绝对都行；本机请求 fetch
      fetch(input.notifyUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mock-pay': 'true' },
        body: JSON.stringify({ order_no: input.orderNo, success: true }),
      }).catch(() => {
        // 测试模式下 web 可能不在跑；忽略
      });
    }, 5000);

    return {
      qrCodeUrl: `mock://qr/${input.orderNo}`,
      prepayId: `mock-prepay-${input.orderNo.slice(-8)}`,
    };
  }

  verifyCallback(_headers: Record<string, string | undefined>, body: unknown): VerifiedCallback {
    const b = (body ?? {}) as { order_no?: string; success?: boolean };
    return { orderNo: b.order_no ?? '', success: b.success ?? false };
  }
}
```

`web/src/lib/clients/pay/wechat.ts`:
```ts
import type { PayClient, CreateOrderInput, CreateOrderResult, VerifiedCallback } from './interface';
import { AppError, ErrCode } from '@/lib/core/errors';

/**
 * 微信支付 V3 Native API stub。完整实现需要：
 * - apiclient_cert.pem / apiclient_key.pem 证书加载
 * - 平台证书拉取 + Wechatpay-Signature 校验
 * - V3 RSA 签名请求
 *
 * 当前为占位：检查 env 配置，未配置抛错；调用直接抛"未实现"。
 * 后续接入用 `wechatpay-node-v3` 包替换。
 */
export class WechatPayClient implements PayClient {
  constructor() {
    const required = ['WECHAT_PAY_APP_ID', 'WECHAT_PAY_MCH_ID', 'WECHAT_PAY_API_KEY', 'WECHAT_PAY_NOTIFY_URL'];
    for (const k of required) {
      if (!process.env[k]) {
        throw new AppError(ErrCode.WechatPayCreateFailed, `${k} 未配置；请改用 MOCK_PAY=true 或填入凭证`);
      }
    }
  }

  async createNativeOrder(_input: CreateOrderInput): Promise<CreateOrderResult> {
    throw new AppError(
      ErrCode.WechatPayCreateFailed,
      '微信支付 V3 Native 客户端未完整实现；请填证书 + 接入 `wechatpay-node-v3` SDK 后再切真实模式。当前请用 MOCK_PAY=true。'
    );
  }

  verifyCallback(_headers: Record<string, string | undefined>, _body: unknown): VerifiedCallback {
    throw new AppError(ErrCode.WechatPayCreateFailed, '微信回调验签未实现');
  }
}
```

`web/src/lib/clients/pay/index.ts`:
```ts
import type { PayClient } from './interface';
import { MockPayClient } from './mock';
import { WechatPayClient } from './wechat';

export type { PayClient, CreateOrderInput, CreateOrderResult, VerifiedCallback } from './interface';

let cached: PayClient | undefined;

export function getPayClient(): PayClient {
  if (cached) return cached;
  cached = process.env.MOCK_PAY === 'true' ? new MockPayClient() : new WechatPayClient();
  return cached;
}

export function _resetPayClient(): void {
  cached = undefined;
}
```

- [ ] **Step 4: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/pay-mock.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/clients/pay/ web/tests/unit/pay-mock.test.ts
git commit -m "feat(pay): mock + wechat stub PayClient behind factory"
```

---

## Task 4: POST /api/order/create (TDD)

**Files:**
- Create: `web/src/app/api/order/create/route.ts`
- Create: `web/tests/integration/order-api.test.ts`

- [ ] **Step 1: Failing test**

`web/tests/integration/order-api.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

import { redis } from '@/lib/redis';
import { POST as createOrder } from '@/app/api/order/create/route';
import { testPrisma, resetDb } from '../helpers/test-db';
import { signUserToken } from '@/lib/core/auth';

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  process.env.MOCK_PAY = 'true';
  process.env.WECHAT_PAY_NOTIFY_URL = 'http://localhost:3000/api/order/wechat-callback';
  await (redis as any).flushall();
  await resetDb();
});

async function makeUserAndToken() {
  const user = await testPrisma.user.create({
    data: { userId: 'AC10000001', phone: '13800138000', points: 0 },
  });
  const token = await signUserToken({ uid: user.id, userId: user.userId });
  return { user, token };
}

function makeReq(body: unknown, token: string) {
  return new Request('http://localhost/api/order/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `auth-token=${token}` },
    body: JSON.stringify(body),
  });
}

describe('POST /api/order/create', () => {
  it('creates a pending order with QR code URL', async () => {
    const { user, token } = await makeUserAndToken();
    const res = await createOrder(makeReq({ package_type: 'standard' }, token));
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.order_no).toMatch(/^AC\d{14}[A-Z0-9]{4}$/);
    expect(json.data.amount).toBe(39.9);
    expect(json.data.points).toBe(5000);
    expect(json.data.qr_code_url).toContain('mock');

    const order = await testPrisma.order.findUnique({ where: { orderNo: json.data.order_no } });
    expect(order).toBeTruthy();
    expect(order!.userId).toBe(user.id);
    expect(order!.status).toBe('pending');
    expect(order!.packageType).toBe('standard');
    expect(Number(order!.amountYuan)).toBe(39.9);
  });

  it('rejects invalid package type', async () => {
    const { token } = await makeUserAndToken();
    const res = await createOrder(makeReq({ package_type: 'foo' }, token));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/order/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ package_type: 'basic' }),
    });
    const res = await createOrder(req as any);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/order-api.test.ts
```

- [ ] **Step 3: Implement**

`web/src/app/api/order/create/route.ts`:
```ts
import { z } from 'zod';
import { withAuth } from '@/lib/middleware/with-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode, AppError } from '@/lib/core/errors';
import { generateOrderNo } from '@/lib/core/order-no';
import { getPackageInfo, isValidPackageType, ORDER_EXPIRY_MS } from '@/lib/core/orders';
import { prisma } from '@/lib/db/prisma';
import { getPayClient } from '@/lib/clients/pay';

const reqSchema = z.object({
  package_type: z.string().refine(isValidPackageType, '无效套餐类型'),
});

export async function POST(req: Request) {
  return withAuth(req, async (request, user) => {
    let body: unknown;
    try { body = await request.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');

    const packageType = parsed.data.package_type as 'basic' | 'standard' | 'premium';
    const pkg = getPackageInfo(packageType);

    const orderNo = generateOrderNo();

    const order = await prisma.order.create({
      data: {
        orderNo,
        userId: user.uid,
        packageType,
        amountYuan: pkg.yuan,
        points: pkg.points,
        status: 'pending',
      },
    });

    const notifyUrl = process.env.WECHAT_PAY_NOTIFY_URL ?? 'http://localhost:3000/api/order/wechat-callback';

    let payResult;
    try {
      payResult = await getPayClient().createNativeOrder({
        orderNo,
        amountYuan: pkg.yuan,
        description: `AI 智能创作 - ${packageType}套餐`,
        notifyUrl,
      });
    } catch (e) {
      const msg = e instanceof AppError ? e.message : '创建支付订单失败';
      return err(ErrCode.WechatPayCreateFailed, msg);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { wechatPrepayId: payResult.prepayId },
    });

    const expireAt = new Date(order.createdAt.getTime() + ORDER_EXPIRY_MS);

    return ok({
      order_no: orderNo,
      amount: pkg.yuan,
      points: pkg.points,
      qr_code_url: payResult.qrCodeUrl,
      expire_at: expireAt.toISOString(),
    }, '订单已创建');
  });
}
```

- [ ] **Step 4: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/order-api.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/order/create/ web/tests/integration/order-api.test.ts
git commit -m "feat(api): POST /api/order/create with QR code (mock)"
```

---

## Task 5: GET /api/order/status/:id (TDD, append)

**Files:**
- Create: `web/src/app/api/order/status/[id]/route.ts`
- Modify: `web/tests/integration/order-api.test.ts` (append)

- [ ] **Step 1: Append tests**

Append to `web/tests/integration/order-api.test.ts`:
```ts
import { GET as getStatus } from '@/app/api/order/status/[id]/route';

async function makeOrder(userId: string, status: 'pending' | 'paid' | 'expired') {
  return testPrisma.order.create({
    data: {
      orderNo: status === 'pending' ? 'AC20260418123456PEND' : status === 'paid' ? 'AC20260418123456PAID' : 'AC20260418123456EXPI',
      userId,
      packageType: 'standard',
      amountYuan: 39.9,
      points: 5000,
      status,
    },
  });
}

describe('GET /api/order/status/:id', () => {
  it('returns order status to its owner', async () => {
    const { user, token } = await makeUserAndToken();
    const order = await makeOrder(user.id, 'pending');
    const req = new Request(`http://localhost/api/order/status/${order.orderNo}`, {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await getStatus(req as any, { params: { id: order.orderNo } });
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.status).toBe('pending');
    expect(json.data.order_no).toBe(order.orderNo);
  });

  it('returns 404 for unknown order', async () => {
    const { token } = await makeUserAndToken();
    const req = new Request('http://localhost/api/order/status/AC00000000000000XXXX', {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await getStatus(req as any, { params: { id: 'AC00000000000000XXXX' } });
    const json = await res.json();
    expect(json.code).toBe(2020);
  });

  it('forbids access to other user orders', async () => {
    const owner = await testPrisma.user.create({
      data: { userId: 'AC22222222', phone: '13700137000', points: 0 },
    });
    const order = await makeOrder(owner.id, 'pending');

    const { token } = await makeUserAndToken();  // 其他用户
    const req = new Request(`http://localhost/api/order/status/${order.orderNo}`, {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await getStatus(req as any, { params: { id: order.orderNo } });
    const json = await res.json();
    expect(json.code).toBe(2020);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/order-api.test.ts
```

- [ ] **Step 3: Implement**

`web/src/app/api/order/status/[id]/route.ts`:
```ts
import { withAuth } from '@/lib/middleware/with-auth';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { prisma } from '@/lib/db/prisma';
import { ORDER_EXPIRY_MS } from '@/lib/core/orders';

export async function GET(req: Request, ctx: { params: { id: string } }) {
  return withAuth(req, async (_, user) => {
    const orderNo = ctx.params.id;
    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order || order.userId !== user.uid) {
      return err(ErrCode.OrderInvalid, '订单不存在或无权访问');
    }

    // 自动判断 expired
    let status = order.status;
    if (status === 'pending' && order.createdAt.getTime() + ORDER_EXPIRY_MS < Date.now()) {
      // 标记为 expired (best-effort)
      await prisma.order.update({ where: { id: order.id }, data: { status: 'expired' } }).catch(() => {});
      status = 'expired';
    }

    return ok({
      order_no: order.orderNo,
      status,
      amount: Number(order.amountYuan),
      points: order.points,
      paid_at: order.paidAt?.toISOString() ?? null,
      created_at: order.createdAt.toISOString(),
    });
  });
}
```

- [ ] **Step 4: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/order-api.test.ts
```

Expected: 6 tests pass (3 + 3).

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add 'web/src/app/api/order/status/' web/tests/integration/order-api.test.ts
git commit -m "feat(api): GET /api/order/status/:id with auto-expire"
```

---

## Task 6: POST /api/order/wechat-callback (TDD)

**Files:**
- Create: `web/src/app/api/order/wechat-callback/route.ts`
- Modify: `web/tests/integration/order-api.test.ts` (append)

- [ ] **Step 1: Append tests**

Append to `web/tests/integration/order-api.test.ts`:
```ts
import { POST as wechatCallback } from '@/app/api/order/wechat-callback/route';

describe('POST /api/order/wechat-callback', () => {
  it('marks order paid + adds points + records transaction (idempotent)', async () => {
    const { user } = await makeUserAndToken();
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456CALL',
        userId: user.id,
        packageType: 'standard',
        amountYuan: 39.9,
        points: 5000,
        status: 'pending',
      },
    });

    const req = new Request('http://localhost/api/order/wechat-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: order.orderNo, success: true }),
    });
    const res = await wechatCallback(req as any);
    expect(res.status).toBe(200);

    const updated = await testPrisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('paid');
    expect(updated!.paidAt).toBeTruthy();

    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(5000);

    const tx = await testPrisma.pointTransaction.findFirst({ where: { userId: user.id } });
    expect(tx!.amount).toBe(5000);
    expect(tx!.type).toBe('recharge');
    expect(tx!.relatedOrderId).toBe(order.orderNo);

    // 重复回调：order 状态不变，积分不重复加
    const req2 = new Request('http://localhost/api/order/wechat-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: order.orderNo, success: true }),
    });
    const res2 = await wechatCallback(req2 as any);
    expect(res2.status).toBe(200);
    const finalUser = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(finalUser!.points).toBe(5000);  // 不重复加
  });

  it('ignores callback for unknown order', async () => {
    const req = new Request('http://localhost/api/order/wechat-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: 'AC00000000000000XXXX', success: true }),
    });
    const res = await wechatCallback(req as any);
    // 微信收到 200 即可（不影响业务，只是无 order）
    expect(res.status).toBe(200);
  });

  it('marks order failed if success=false', async () => {
    const { user } = await makeUserAndToken();
    const order = await testPrisma.order.create({
      data: {
        orderNo: 'AC20260418123456FAIL',
        userId: user.id,
        packageType: 'basic',
        amountYuan: 19.9,
        points: 2000,
        status: 'pending',
      },
    });
    const req = new Request('http://localhost/api/order/wechat-callback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order_no: order.orderNo, success: false }),
    });
    await wechatCallback(req as any);

    const updated = await testPrisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('failed');
    const u = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(u!.points).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/order-api.test.ts
```

- [ ] **Step 3: Implement**

`web/src/app/api/order/wechat-callback/route.ts`:
```ts
import { ok } from '@/lib/core/http';
import { prisma } from '@/lib/db/prisma';
import { getPayClient } from '@/lib/clients/pay';
import { addPoints } from '@/lib/core/points';

/**
 * 微信支付回调（含 mock 模式）。
 * 关键点：
 * - 用 getPayClient().verifyCallback 校验签名
 * - 状态机幂等：UPDATE WHERE status='pending' → affectedRows 决定是否处理
 * - 总是返回 200（微信失败会重试，不该 4xx/5xx）
 */
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return ok({ received: true }); }

  const headers: Record<string, string | undefined> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  let verified;
  try {
    verified = getPayClient().verifyCallback(headers, body);
  } catch {
    return ok({ received: true });  // 验签失败也回 200
  }

  if (!verified.orderNo) return ok({ received: true });

  const order = await prisma.order.findUnique({ where: { orderNo: verified.orderNo } });
  if (!order) return ok({ received: true });

  if (verified.success) {
    // 状态机：pending → paid（幂等）
    const result = await prisma.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'paid', paidAt: new Date() },
    });
    if (result.count === 1) {
      // 仅在状态成功翻转时才加积分
      await addPoints({
        userId: order.userId,
        amount: order.points,
        description: `充值${order.points}积分`,
        relatedOrderId: order.orderNo,
      });
    }
  } else {
    await prisma.order.updateMany({
      where: { id: order.id, status: 'pending' },
      data: { status: 'failed' },
    });
  }

  return ok({ received: true });
}
```

- [ ] **Step 4: Run test pass**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/order-api.test.ts
```

Expected: 9 tests pass (3+3+3).

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/order/wechat-callback/ web/tests/integration/order-api.test.ts
git commit -m "feat(api): POST /api/order/wechat-callback with idempotent state machine"
```

---

## Task 7: Recharge UI

**Files:**
- Create: `web/src/components/features/PackageCard.tsx`
- Create: `web/src/components/features/PaymentModal.tsx`
- Create: `web/src/app/(auth)/recharge/page.tsx`
- Create: `web/src/app/(auth)/recharge/RechargeUI.tsx`

- [ ] **Step 1: Install QR code lib**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add qrcode.react
```

- [ ] **Step 2: PackageCard**

`web/src/components/features/PackageCard.tsx`:
```tsx
'use client';

import { clsx } from 'clsx';
import { GlassCard } from '@/components/ui/GlassCard';

interface Props {
  type: 'basic' | 'standard' | 'premium';
  yuan: number;
  points: number;
  badge?: string;
  selected: boolean;
  onClick: () => void;
}

const ICONS = { basic: '🔥', standard: '⭐', premium: '👑' };
const NAMES = { basic: '基础', standard: '标准', premium: '尊享' };

export function PackageCard({ type, yuan, points, badge, selected, onClick }: Props) {
  return (
    <button onClick={onClick} className="text-left">
      <GlassCard
        className={clsx(
          'space-y-3 transition-all',
          selected ? 'border-accent bg-white/10' : 'hover:bg-white/8'
        )}
      >
        <div className="flex items-center gap-2 text-lg text-white">
          <span>{ICONS[type]}</span>
          <span>{NAMES[type]}</span>
        </div>
        <div className="text-3xl font-editorial text-white">{points.toLocaleString()}</div>
        <div className="text-sm text-white/60">积分</div>
        <div className="text-2xl font-medium text-accent">¥ {yuan}</div>
        {badge && <div className="text-xs text-accent/80">{badge}</div>}
      </GlassCard>
    </button>
  );
}
```

- [ ] **Step 3: PaymentModal**

`web/src/components/features/PaymentModal.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Order {
  order_no: string;
  amount: number;
  qr_code_url: string;
  expire_at: string;
}

interface Props {
  order: Order;
  onClose: () => void;
  onPaid: () => void;
}

export function PaymentModal({ order, onClose, onPaid }: Props) {
  const [status, setStatus] = useState<'pending' | 'paid' | 'expired' | 'failed'>('pending');
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.floor((new Date(order.expire_at).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    if (status !== 'pending') return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/order/status/${order.order_no}`);
        const json = await res.json();
        if (json.code === 0) {
          setStatus(json.data.status);
          if (json.data.status === 'paid') onPaid();
        }
      } catch {}
    }, 2000);
    return () => clearInterval(t);
  }, [status, order.order_no, onPaid]);

  useEffect(() => {
    if (status !== 'pending') return;
    const t = setInterval(() => {
      setSecondsLeft(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [status]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <GlassCard className="w-full max-w-sm space-y-4 text-center">
        {status === 'pending' && (
          <>
            <h3 className="font-editorial text-xl text-white">微信扫码支付</h3>
            <div className="bg-white p-4 rounded-xl inline-block">
              <QRCodeSVG value={order.qr_code_url} size={200} />
            </div>
            <p className="text-sm text-white/70">订单号：{order.order_no}</p>
            <p className="text-2xl text-accent">¥ {order.amount}</p>
            <p className="text-xs text-white/50">
              剩余 {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} 自动过期
            </p>
            <p className="text-xs text-white/50">
              （MOCK_PAY=true 时，5 秒后自动模拟支付成功）
            </p>
            <Button variant="ghost" fullWidth onClick={onClose}>关闭</Button>
          </>
        )}
        {status === 'paid' && (
          <>
            <h3 className="font-editorial text-xl text-white">✅ 支付成功</h3>
            <p className="text-sm text-white/70">积分已到账</p>
            <Button fullWidth onClick={onClose}>完成</Button>
          </>
        )}
        {(status === 'expired' || status === 'failed') && (
          <>
            <h3 className="font-editorial text-xl text-white">订单 {status === 'expired' ? '已过期' : '失败'}</h3>
            <Button fullWidth onClick={onClose}>关闭</Button>
          </>
        )}
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 4: RechargeUI**

`web/src/app/(auth)/recharge/RechargeUI.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { PackageCard } from '@/components/features/PackageCard';
import { PaymentModal } from '@/components/features/PaymentModal';

const PACKAGES = [
  { type: 'basic', yuan: 19.9, points: 2000 },
  { type: 'standard', yuan: 39.9, points: 5000, badge: '多送 25%' },
  { type: 'premium', yuan: 99.9, points: 12000, badge: '多送 20%' },
] as const;

interface Order {
  order_no: string;
  amount: number;
  points: number;
  qr_code_url: string;
  expire_at: string;
}

export function RechargeUI({ initialPoints }: { initialPoints: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<'basic' | 'standard' | 'premium'>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  async function checkout() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/order/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ package_type: selected }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        return;
      }
      setOrder(json.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-white/70">当前积分：🪙 {initialPoints.toLocaleString()}</div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PACKAGES.map(p => (
          <PackageCard
            key={p.type}
            type={p.type}
            yuan={p.yuan}
            points={p.points}
            badge={(p as { badge?: string }).badge}
            selected={selected === p.type}
            onClick={() => setSelected(p.type)}
          />
        ))}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button fullWidth loading={busy} onClick={checkout}>
        微信支付
      </Button>
      {order && (
        <PaymentModal
          order={order}
          onClose={() => {
            setOrder(null);
            router.refresh();
          }}
          onPaid={() => router.refresh()}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Recharge page**

`web/src/app/(auth)/recharge/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyUserToken } from '@/lib/core/auth';
import { prisma } from '@/lib/db/prisma';
import { RechargeUI } from './RechargeUI';

export default async function RechargePage() {
  const token = cookies().get('auth-token')?.value;
  if (!token) redirect('/login');
  const payload = await verifyUserToken(token).catch(() => null);
  if (!payload) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-editorial text-3xl text-white">💰 积分充值</h1>
        <p className="mt-1 text-sm text-white/60">选择套餐，扫码完成支付</p>
      </div>
      <RechargeUI initialPoints={user.points} />
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add 'web/src/app/(auth)/recharge/' web/src/components/features/PackageCard.tsx web/src/components/features/PaymentModal.tsx web/package.json web/pnpm-lock.yaml
git commit -m "feat(ui): recharge page with PackageCard + PaymentModal (QR code)"
```

---

## Task 8: README + 验收 + tag

- [ ] **Step 1: Update README**

In `/Users/benzema/code/ai-creative-tool/README.md` "已完成 Plan" 部分：
```markdown
- ✅ **Plan 1 (P0 + P1)**：骨架 + 认证 — 21 tasks
- ✅ **Plan 2 (P2)**：视频解析 + 文案提取 + ffmpeg.wasm 裁剪 — 17 tasks
- ✅ **Plan 3 (P3)**：积分充值 + 微信支付 (mock) — 8 tasks
- 🟡 **Plan 4 (P4 + P5)**：后台管理 + 测试加固 — 待写
```

加测试充值 section：
```markdown
## 测试充值流程（mock 模式）

1. 登录 → 顶部 Navbar 点「充值」
2. 选择套餐 → 点「微信支付」→ 弹出二维码 + mock 提示
3. **5 秒后自动模拟支付成功** → 关闭弹窗 → 顶部积分自动刷新
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

Expected:
- web tests: ~80+ pass (was 65 in P2, +15 new)
- e2e: still 2
- python: still 14

- [ ] **Step 3: Commit + tag**

```bash
cd /Users/benzema/code/ai-creative-tool
git add README.md
git commit -m "docs: README updated for P3 milestone (recharge + mock pay)"
git tag -a v0.3.0-p3 -m "P3: recharge + WeChat pay (mock mode)"
git log --oneline | head -15
```

---

## 验收清单

- [ ] 单元 + 集成测试全绿（≥80 web，14 python）
- [ ] E2E 还能跑通（2 个）
- [ ] 浏览器手动跑通：登录 → /recharge → 选套餐 → 弹二维码 → 5 秒后自动支付成功 → 积分到账
- [ ] git tag v0.3.0-p3

---

## 下一步

Plan 3 完成后，写 **Plan 4 (P4 + P5)**：后台管理系统（用户/积分/记录/CSV 导出）+ 历史页 + 安全加固。
