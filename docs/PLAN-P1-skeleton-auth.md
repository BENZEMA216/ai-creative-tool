# AI 智能创作 — Plan 1 (P0 + P1)：骨架 + 认证

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建完整 monorepo 骨架（Next.js + Postgres + Redis + ytdlp-service stub）并实现完整手机号登录注册流程（mock SMS 模式），让 `docker compose up` 后能完整跑通"打开 / → 输入手机号+验证码 → 进入 dashboard"路径。

**Architecture:** Next.js 14 App Router + TypeScript + Tailwind + Prisma；外部服务（SMS）用 interface + factory 双轨抽象，默认 mock；JWT 存 httpOnly cookie；rate limit 走 Redis token bucket；TDD 优先。

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, Prisma + PostgreSQL, Redis (ioredis), ioredis-mock for tests, jose (JWT), zod, bcryptjs, vitest, supertest, @playwright/test, FastAPI (P0 stub only).

**Spec reference:** `docs/superpowers/specs/2026-04-18-ai-creative-tool-design.md` §2 (scope), §3 (architecture), §4 (data model), §5.1 (SMS client), §6 (业务流), §8 (security), §9 (testing).

**Repo location:** `/Users/benzema/code/ai-creative-tool/` (new git repo)

---

## File Structure (Plan 1 全部产出)

```
ai-creative-tool/
├── docker-compose.yml                  # 4 services: web, ytdlp, postgres, redis
├── docker-compose.dev.yml              # dev overrides (volumes, hot reload)
├── .env.example                        # 完整 env 模板
├── .gitignore
├── README.md                           # quickstart
│
├── web/
│   ├── package.json
│   ├── pnpm-lock.yaml
│   ├── next.config.mjs                 # 含 COOP/COEP for ffmpeg.wasm (后续用)
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── postcss.config.mjs
│   ├── Dockerfile
│   ├── .eslintrc.json
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   ├── .env.local.example
│   │
│   ├── prisma/
│   │   ├── schema.prisma               # 6 张表全 schema (P0 全建)
│   │   └── seed.ts                     # 1 admin + 2 测试用户
│   │
│   └── src/
│       ├── app/
│       │   ├── layout.tsx              # 根 layout：字体、metadata、globals.css
│       │   ├── globals.css             # Tailwind + glassmorphism + editorial 字体
│       │   ├── page.tsx                # → server-redirect 到 /login or /dashboard
│       │   ├── (public)/login/page.tsx
│       │   ├── (auth)/dashboard/page.tsx  # P1: 空 placeholder 页（含登出）
│       │   └── api/
│       │       ├── auth/
│       │       │   ├── send-code/route.ts
│       │       │   ├── login/route.ts
│       │       │   ├── logout/route.ts
│       │       │   └── me/route.ts
│       │       └── _dev/
│       │           └── peek-sms/route.ts   # 仅 dev mode：读 mock SMS 暂存
│       │
│       ├── components/
│       │   ├── ui/
│       │   │   ├── Button.tsx
│       │   │   ├── Input.tsx
│       │   │   └── GlassCard.tsx
│       │   └── layout/
│       │       └── Navbar.tsx
│       │
│       └── lib/
│           ├── clients/
│           │   └── sms/
│           │       ├── interface.ts
│           │       ├── mock.ts
│           │       ├── tencent.ts        # 真实现，stub 暂时抛 not-implemented if no creds
│           │       └── index.ts          # factory by env
│           ├── core/
│           │   ├── auth.ts               # JWT sign/verify
│           │   ├── user-id.ts            # AC + 8 digits
│           │   ├── rate-limit.ts         # Redis token bucket
│           │   ├── errors.ts             # ErrCode enum + AppError
│           │   └── http.ts               # ok()/err() response helpers
│           ├── db/
│           │   └── prisma.ts             # singleton client
│           ├── redis.ts                  # singleton client (real or in-memory by env)
│           ├── middleware/
│           │   └── with-auth.ts
│           └── validation/
│               └── auth.ts               # zod schemas
│
├── tests/                                # web/tests/ 实际位置
│   ├── unit/
│   │   ├── user-id.test.ts
│   │   ├── auth-jwt.test.ts
│   │   ├── rate-limit.test.ts
│   │   ├── sms-mock.test.ts
│   │   └── platform.test.ts              # 提前占位（P2 用）
│   ├── integration/
│   │   └── auth-api.test.ts
│   └── e2e/
│       └── login.spec.ts
│
└── ytdlp-service/                       # P0 stub only
    ├── pyproject.toml
    ├── Dockerfile
    └── app/
        └── main.py                       # 仅 GET /health → {"ok": true}
```

---

## Conventions (所有任务遵守)

- **Commit style**: `<type>(<scope>): <subject>`，type ∈ `feat|fix|chore|test|refactor|docs`
- **每个任务** 跑完最后一步 `git commit`，commit message 已写在步骤里
- **绝对路径**：所有文件路径从仓库根 `ai-creative-tool/` 起算，但 cd 在 `web/` 时也会标注
- **TDD**：业务逻辑全部先写测试再写实现；纯 bootstrap 任务（init / config）跳过 TDD
- **不跳测试**：每个 task 最后一步必须 "Run all tests, expect green"
- **依赖管理**：web 用 `pnpm`；Python service 用 `uv`

---

## Task 1: 仓库初始化 + git

**Files:**
- Create: `/Users/benzema/code/ai-creative-tool/.gitignore`
- Create: `/Users/benzema/code/ai-creative-tool/README.md`

- [ ] **Step 1: 创建仓库目录并初始化 git**

```bash
mkdir -p /Users/benzema/code/ai-creative-tool
cd /Users/benzema/code/ai-creative-tool
git init -b main
```

Expected: "Initialized empty Git repository in ..."

- [ ] **Step 2: 创建 `.gitignore`**

`/Users/benzema/code/ai-creative-tool/.gitignore`:
```gitignore
# Node
node_modules/
.next/
out/
dist/
*.log
.npm/
.pnpm-store/

# Env
.env
.env.local
.env.*.local

# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/

# OS
.DS_Store
Thumbs.db

# IDE
.vscode/
.idea/
*.swp

# Coverage
coverage/
.nyc_output/

# Playwright
test-results/
playwright-report/
playwright/.cache/

# Temp
/tmp/
*.tmp

# Prisma generated
web/src/generated/
```

- [ ] **Step 3: 创建 README.md（quickstart 占位）**

`/Users/benzema/code/ai-creative-tool/README.md`:
```markdown
# AI 智能创作

短视频文案提取 + 视频下载 Web 工具。

## Quick Start

\`\`\`bash
cp .env.example .env
docker compose up -d
\`\`\`

打开 http://localhost:3000

## Architecture

见 \`docs/superpowers/specs/2026-04-18-ai-creative-tool-design.md\`

## 开发

- `web/` — Next.js 14 前后端
- `ytdlp-service/` — Python FastAPI 微服务

详见各子目录 README。
```

- [ ] **Step 4: 初始 commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add .gitignore README.md
git commit -m "chore: init repo with gitignore and README"
```

Expected: "[main (root-commit) ...] chore: init repo..."

---

## Task 2: Next.js 14 项目脚手架

**Files:**
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.mjs`
- Create: `web/postcss.config.mjs`
- Create: `web/tailwind.config.ts`
- Create: `web/src/app/layout.tsx`
- Create: `web/src/app/page.tsx`
- Create: `web/src/app/globals.css`

- [ ] **Step 1: 用 pnpm 创建 Next.js 项目**

```bash
cd /Users/benzema/code/ai-creative-tool
pnpm create next-app@14 web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git --use-pnpm
```

Expected: 创建 `web/` 目录，含基础 Next.js 14 项目。
若提示 "Would you like to use Turbopack" → 选 `No`。

- [ ] **Step 2: 验证启动**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm dev
```

打开 http://localhost:3000 → 看到 Next.js 默认欢迎页 → Ctrl+C 关闭。

- [ ] **Step 3: 修改 `next.config.mjs`，加 COOP/COEP headers（为 P2 ffmpeg.wasm 准备）**

`web/next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

export default nextConfig;
```

- [ ] **Step 4: 替换 `web/src/app/page.tsx` 为 redirect**

`web/src/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/login');
}
```

- [ ] **Step 5: 替换 `web/src/app/layout.tsx`**

`web/src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 智能创作',
  description: '短视频文案提取 + 视频下载',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="bg-gradient-page min-h-screen text-white antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 6: 替换 `web/src/app/globals.css`，加 glassmorphism + editorial 字体**

`web/src/app/globals.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-deep: #0b0d1f;
  --bg-plum: #1f1233;
  --accent: #c4b5fd;
}

html, body {
  font-family: 'Inter Tight', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

h1, h2, .editorial {
  font-family: 'Fraunces', Georgia, serif;
  font-feature-settings: 'ss01';
}

.bg-gradient-page {
  background: radial-gradient(ellipse at top left, var(--bg-plum) 0%, var(--bg-deep) 60%);
  background-attachment: fixed;
}

.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid rgba(255, 255, 255, 0.10);
}
```

- [ ] **Step 7: 替换 `web/tailwind.config.ts`**

`web/tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        editorial: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'PingFang SC', 'sans-serif'],
      },
      colors: {
        accent: '#c4b5fd',
      },
    },
  },
  plugins: [],
};
export default config;
```

- [ ] **Step 8: 验证编译通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build
```

Expected: "Compiled successfully" + 没有 TypeScript 错误。

- [ ] **Step 9: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/
git commit -m "feat(web): scaffold Next.js 14 + Tailwind with editorial glassmorphism base"
```

---

## Task 3: 安装核心依赖

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: 安装运行时依赖**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add prisma @prisma/client ioredis jose zod bcryptjs cookie nanoid
pnpm add -D @types/bcryptjs @types/cookie
```

- [ ] **Step 2: 安装测试依赖**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add -D vitest @vitest/coverage-v8 @vitest/ui supertest @types/supertest \
  ioredis-mock @types/ioredis-mock @playwright/test
```

- [ ] **Step 3: 安装腾讯云 SMS SDK（real client 用）**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add tencentcloud-sdk-nodejs-sms
```

- [ ] **Step 4: 验证 package.json 含所有依赖 + commit**

```bash
cd /Users/benzema/code/ai-creative-tool/web
cat package.json | grep -E '"(prisma|@prisma|ioredis|jose|zod|bcryptjs|tencent|vitest|playwright)"'
```

Expected: 看到全部依赖列出。

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/package.json web/pnpm-lock.yaml
git commit -m "chore(web): add prisma/redis/jwt/zod/test deps"
```

---

## Task 4: Vitest 配置 + 第一个 sanity 测试

**Files:**
- Create: `web/vitest.config.ts`
- Create: `web/tests/unit/sanity.test.ts`
- Modify: `web/package.json` (scripts)

- [ ] **Step 1: 创建 vitest.config.ts**

`web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'] },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

- [ ] **Step 2: 加 npm scripts**

修改 `web/package.json` 的 `scripts`:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate deploy",
    "db:migrate:dev": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

加 `tsx` 依赖：
```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add -D tsx
```

- [ ] **Step 3: 写一个 sanity test 验证 vitest 跑得起来**

`web/tests/unit/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 4: 跑测试**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test
```

Expected: `Test Files 1 passed (1)`, `Tests 1 passed (1)`.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/vitest.config.ts web/tests/ web/package.json web/pnpm-lock.yaml
git commit -m "test(web): set up vitest with sanity test"
```

---

## Task 5: Prisma schema (6 张表全建)

**Files:**
- Create: `web/prisma/schema.prisma`

- [ ] **Step 1: 初始化 prisma**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm prisma init --datasource-provider postgresql
```

Expected: 创建 `prisma/schema.prisma` + 修改 `.env`（暂时忽略 .env，后面用 .env.example 统一管理）。

- [ ] **Step 2: 替换 schema.prisma 为完整 schema（按 spec §4）**

`web/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserStatus {
  active
  banned
}

enum SmsPurpose {
  login
  register
}

enum PointTxnType {
  recharge
  consume
  admin_adjust
}

enum PackageType {
  basic
  standard
  premium
}

enum OrderStatus {
  pending
  paid
  failed
  refunded
  expired
}

enum UsageType {
  extract_text
  download_video
}

enum UsageStatus {
  success
  failed
}

enum AdminRole {
  admin
  super_admin
}

model User {
  id        String     @id @default(uuid()) @db.Uuid
  userId    String     @unique @map("user_id") @db.VarChar(10)
  phone     String     @unique @db.VarChar(20)
  nickname  String     @default("创作者") @db.VarChar(50)
  avatarUrl String?    @map("avatar_url") @db.VarChar(500)
  points    Int        @default(0)
  status    UserStatus @default(active)
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  pointTxns    PointTransaction[]
  orders       Order[]
  usageRecords UsageRecord[]

  @@map("users")
}

model SmsCode {
  id        Int        @id @default(autoincrement())
  phone     String     @db.VarChar(20)
  code      String     @db.VarChar(6)
  purpose   SmsPurpose
  expiredAt DateTime   @map("expired_at")
  used      Boolean    @default(false)
  createdAt DateTime   @default(now()) @map("created_at")

  @@index([phone, purpose])
  @@map("sms_codes")
}

model PointTransaction {
  id             Int          @id @default(autoincrement())
  userId         String       @map("user_id") @db.Uuid
  type           PointTxnType
  amount         Int
  balanceAfter   Int          @map("balance_after")
  description    String?      @db.VarChar(200)
  relatedOrderId String?      @map("related_order_id") @db.VarChar(100)
  createdAt      DateTime     @default(now()) @map("created_at")
  user           User         @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@map("point_transactions")
}

model Order {
  id             String      @id @default(uuid()) @db.Uuid
  orderNo        String      @unique @map("order_no") @db.VarChar(32)
  userId         String      @map("user_id") @db.Uuid
  packageType    PackageType @map("package_type")
  amountYuan     Decimal     @map("amount_yuan") @db.Decimal(10, 2)
  points         Int
  status         OrderStatus @default(pending)
  wechatPrepayId String?     @map("wechat_prepay_id") @db.VarChar(100)
  paidAt         DateTime?   @map("paid_at")
  createdAt      DateTime    @default(now()) @map("created_at")
  user           User        @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@map("orders")
}

model UsageRecord {
  id             Int         @id @default(autoincrement())
  userId         String      @map("user_id") @db.Uuid
  type           UsageType
  videoUrl       String      @map("video_url") @db.VarChar(1000)
  platform       String      @db.VarChar(20)
  status         UsageStatus
  pointsConsumed Int         @default(0) @map("points_consumed")
  resultText     String?     @map("result_text") @db.Text
  resultFileUrl  String?     @map("result_file_url") @db.VarChar(500)
  videoDuration  Int?        @map("video_duration")
  errorMessage   String?     @map("error_message") @db.VarChar(500)
  createdAt      DateTime    @default(now()) @map("created_at")
  user           User        @relation(fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([type, status])
  @@map("usage_records")
}

model AdminUser {
  id                 Int       @id @default(autoincrement())
  username           String    @unique @db.VarChar(50)
  passwordHash       String    @map("password_hash") @db.VarChar(200)
  role               AdminRole @default(admin)
  mustChangePassword Boolean   @default(true) @map("must_change_password")
  createdAt          DateTime  @default(now()) @map("created_at")

  @@map("admin_users")
}
```

- [ ] **Step 3: 删除自动生成的 .env（用 .env.example 管理）**

```bash
cd /Users/benzema/code/ai-creative-tool/web
rm -f .env
```

- [ ] **Step 4: 验证 schema 语法**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm prisma validate
```

Expected: "The schema is valid 🚀"

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/prisma/schema.prisma web/package.json web/pnpm-lock.yaml
git commit -m "feat(db): add full prisma schema for 6 tables"
```

---

## Task 6: Docker Compose 环境（postgres + redis + web stub + ytdlp stub）

**Files:**
- Create: `/Users/benzema/code/ai-creative-tool/docker-compose.yml`
- Create: `/Users/benzema/code/ai-creative-tool/.env.example`
- Create: `web/Dockerfile`
- Create: `ytdlp-service/pyproject.toml`
- Create: `ytdlp-service/Dockerfile`
- Create: `ytdlp-service/app/main.py`

- [ ] **Step 1: 创建 .env.example**

`/Users/benzema/code/ai-creative-tool/.env.example`:
```env
# ===== Database =====
POSTGRES_USER=ai_creative
POSTGRES_PASSWORD=dev_only_password
POSTGRES_DB=ai_creative
DATABASE_URL=postgresql://ai_creative:dev_only_password@postgres:5432/ai_creative

# ===== Redis =====
REDIS_URL=redis://redis:6379

# ===== JWT =====
JWT_SECRET=change-me-in-production-min-32-chars-1234567890
JWT_EXPIRES_IN=7d
ADMIN_JWT_SECRET=change-me-too-different-from-user-jwt-1234567
INTERNAL_API_TOKEN=change-me-shared-between-web-and-ytdlp

# ===== Mock switches (P1 全部 mock) =====
MOCK_SMS=true
MOCK_PAY=true
WHISPER_MODE=mock
STORAGE=local

# ===== Tencent SMS (real, 留空 = 用 mock) =====
TENCENT_SMS_SECRET_ID=
TENCENT_SMS_SECRET_KEY=
TENCENT_SMS_APP_ID=
TENCENT_SMS_SIGN_NAME=
TENCENT_SMS_TEMPLATE_ID=
TENCENT_SMS_REGION=ap-guangzhou

# ===== OpenAI Whisper (P2 用) =====
OPENAI_API_KEY=

# ===== WeChat Pay (P3 用) =====
WECHAT_PAY_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_API_KEY=
WECHAT_PAY_NOTIFY_URL=

# ===== Aliyun OSS (P3 可选) =====
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_BUCKET=
OSS_REGION=

# ===== ytdlp service =====
YTDLP_SERVICE_URL=http://ytdlp:8000
TEMP_DIR=/tmp/ai-creative
TEMP_FILE_MAX_AGE=7200

# ===== Admin bootstrap =====
ADMIN_USERNAME=admin
# 留空 = 启动时随机生成并打到 console (强烈推荐)
ADMIN_INITIAL_PASSWORD=
```

- [ ] **Step 2: 创建 web/Dockerfile**

`web/Dockerfile`:
```dockerfile
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
RUN pnpm prisma generate

FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base AS prod
ENV NODE_ENV=production
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["pnpm", "start"]
```

- [ ] **Step 3: 创建 ytdlp-service stub**

`ytdlp-service/pyproject.toml`:
```toml
[project]
name = "ytdlp-service"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.111",
    "uvicorn[standard]>=0.30",
    "pydantic>=2.7",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8",
    "httpx>=0.27",
]
```

`ytdlp-service/app/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="ytdlp-service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ytdlp-service"}
```

`ytdlp-service/Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app
RUN pip install --no-cache-dir \
    "fastapi>=0.111" \
    "uvicorn[standard]>=0.30" \
    "pydantic>=2.7"
COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 4: 创建 docker-compose.yml**

`/Users/benzema/code/ai-creative-tool/docker-compose.yml`:
```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  ytdlp:
    build:
      context: ./ytdlp-service
    environment:
      INTERNAL_API_TOKEN: ${INTERNAL_API_TOKEN}
      TEMP_DIR: ${TEMP_DIR}
    volumes:
      - temp-files:/tmp/ai-creative
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"]
      interval: 10s
      timeout: 3s
      retries: 5

  web:
    build:
      context: ./web
      target: dev
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      ADMIN_JWT_SECRET: ${ADMIN_JWT_SECRET}
      INTERNAL_API_TOKEN: ${INTERNAL_API_TOKEN}
      MOCK_SMS: ${MOCK_SMS}
      MOCK_PAY: ${MOCK_PAY}
      WHISPER_MODE: ${WHISPER_MODE}
      STORAGE: ${STORAGE}
      YTDLP_SERVICE_URL: ${YTDLP_SERVICE_URL}
      ADMIN_USERNAME: ${ADMIN_USERNAME}
      ADMIN_INITIAL_PASSWORD: ${ADMIN_INITIAL_PASSWORD}
    volumes:
      - ./web:/app
      - /app/node_modules
      - /app/.next
      - temp-files:/tmp/ai-creative
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      ytdlp:
        condition: service_started
    command: sh -c "pnpm prisma migrate deploy && pnpm dev"

volumes:
  postgres-data:
  redis-data:
  temp-files:
```

- [ ] **Step 5: 启动服务（预期会因为 prisma 没 migrate 失败，但 postgres+redis+ytdlp 会起来）**

```bash
cd /Users/benzema/code/ai-creative-tool
cp .env.example .env
docker compose up -d postgres redis ytdlp
```

```bash
docker compose ps
```

Expected: postgres, redis, ytdlp 三个 healthy / running。

```bash
curl http://localhost:8000/health
```

Expected: `{"ok":true,"service":"ytdlp-service"}`

- [ ] **Step 6: 关闭并 commit**

```bash
cd /Users/benzema/code/ai-creative-tool
docker compose down
git add docker-compose.yml .env.example web/Dockerfile ytdlp-service/
git commit -m "feat: add docker-compose with postgres/redis/web/ytdlp services"
```

---

## Task 7: Prisma migrate + 客户端 singleton

**Files:**
- Create: `web/src/lib/db/prisma.ts`
- Create: `web/prisma/migrations/...` (auto-generated)

- [ ] **Step 1: 起 postgres + 跑 migrate dev**

```bash
cd /Users/benzema/code/ai-creative-tool
docker compose up -d postgres
sleep 3
cd web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm prisma migrate dev --name init
```

Expected: 创建 `web/prisma/migrations/<timestamp>_init/migration.sql` + 应用到 DB。

- [ ] **Step 2: 创建 prisma client singleton**

`web/src/lib/db/prisma.ts`:
```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 3: 验证 prisma generate 跑通**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm prisma generate
```

Expected: "Generated Prisma Client (...) to ./node_modules/@prisma/client"

- [ ] **Step 4: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/prisma/migrations/ web/src/lib/db/
git commit -m "feat(db): apply initial migration and add prisma singleton"
```

---

## Task 8: User ID 生成器 (TDD)

**Files:**
- Create: `web/tests/unit/user-id.test.ts`
- Create: `web/src/lib/core/user-id.ts`

- [ ] **Step 1: 写失败测试**

`web/tests/unit/user-id.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateUserId, isValidUserId } from '@/lib/core/user-id';

describe('generateUserId', () => {
  it('returns AC + 8 digits', () => {
    const id = generateUserId();
    expect(id).toMatch(/^AC\d{8}$/);
  });

  it('produces different IDs on repeated calls', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(generateUserId());
    expect(ids.size).toBeGreaterThan(95);
  });
});

describe('isValidUserId', () => {
  it('accepts valid format', () => {
    expect(isValidUserId('AC10086234')).toBe(true);
  });
  it('rejects wrong prefix', () => {
    expect(isValidUserId('AB10086234')).toBe(false);
  });
  it('rejects wrong length', () => {
    expect(isValidUserId('AC1234567')).toBe(false);
    expect(isValidUserId('AC123456789')).toBe(false);
  });
  it('rejects non-digit suffix', () => {
    expect(isValidUserId('AC1008623a')).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/user-id.test.ts
```

Expected: FAIL — "Cannot find module '@/lib/core/user-id'"

- [ ] **Step 3: 实现**

`web/src/lib/core/user-id.ts`:
```ts
import { randomInt } from 'node:crypto';

const PREFIX = 'AC';
const LENGTH = 8;

export function generateUserId(): string {
  const min = 10 ** (LENGTH - 1);
  const max = 10 ** LENGTH;
  return `${PREFIX}${randomInt(min, max)}`;
}

export function isValidUserId(s: string): boolean {
  return new RegExp(`^${PREFIX}\\d{${LENGTH}}$`).test(s);
}
```

- [ ] **Step 4: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/user-id.test.ts
```

Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/core/user-id.ts web/tests/unit/user-id.test.ts
git commit -m "feat(core): user-id generator (AC + 8 digits)"
```

---

## Task 9: Errors module + HTTP response helpers (TDD)

**Files:**
- Create: `web/tests/unit/errors.test.ts`
- Create: `web/src/lib/core/errors.ts`
- Create: `web/src/lib/core/http.ts`

- [ ] **Step 1: 写失败测试**

`web/tests/unit/errors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ErrCode, AppError } from '@/lib/core/errors';
import { ok, err } from '@/lib/core/http';

describe('AppError', () => {
  it('carries code and message', () => {
    const e = new AppError(ErrCode.PointsInsufficient, '积分不足');
    expect(e.code).toBe(ErrCode.PointsInsufficient);
    expect(e.message).toBe('积分不足');
  });
});

describe('ok()', () => {
  it('produces { code: 0, message, data } shape', async () => {
    const res = ok({ hello: 'world' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ code: 0, message: 'success', data: { hello: 'world' } });
  });
});

describe('err()', () => {
  it('produces { code, message, data: null } shape', async () => {
    const res = err(ErrCode.PointsInsufficient, '积分不足');
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ code: 2010, message: '积分不足', data: null });
  });

  it('returns 500 status for system errors (9xxx)', async () => {
    const res = err(ErrCode.InternalError, 'oops');
    expect(res.status).toBe(500);
  });

  it('returns 401 for auth errors (1001-1003)', async () => {
    const res = err(ErrCode.Unauthorized, 'no token');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/errors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 实现 errors.ts（按 spec §7）**

`web/src/lib/core/errors.ts`:
```ts
export enum ErrCode {
  Success = 0,

  // 1xxx 认证
  Unauthorized = 1001,
  TokenInvalid = 1002,
  AccountBanned = 1003,
  AdminPermissionDenied = 1004,

  // 2xxx 业务
  UnsupportedPlatform = 2001,
  VideoTooLong = 2002,
  VideoParseFailed = 2003,
  AudioExtractFailed = 2004,
  PointsInsufficient = 2010,
  PointsTxnConflict = 2011,
  OrderInvalid = 2020,

  // 3xxx 外部
  SmsSendFailed = 3001,
  WechatPayCreateFailed = 3002,
  WhisperFailed = 3003,
  YtdlpFailed = 3004,

  // 9xxx 系统
  InternalError = 9000,
  DependencyDown = 9001,
}

export class AppError extends Error {
  constructor(public readonly code: ErrCode, message: string) {
    super(message);
    this.name = 'AppError';
  }
}
```

`web/src/lib/core/http.ts`:
```ts
import { NextResponse } from 'next/server';
import { ErrCode } from './errors';

export function ok<T>(data: T, message = 'success') {
  return NextResponse.json({ code: 0, message, data });
}

export function err(code: ErrCode, message: string) {
  const status = httpStatusFor(code);
  return NextResponse.json({ code, message, data: null }, { status });
}

function httpStatusFor(code: ErrCode): number {
  if (code === 0) return 200;
  if (code >= 1001 && code <= 1003) return 401;
  if (code === 1004) return 403;
  if (code >= 9000) return 500;
  return 200; // 业务错误（用户能修正）依然 200，靠 code 区分
}
```

- [ ] **Step 4: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/errors.test.ts
```

Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/core/errors.ts web/src/lib/core/http.ts web/tests/unit/errors.test.ts
git commit -m "feat(core): error codes and unified http response helpers"
```

---

## Task 10: Redis client + rate-limit (TDD with ioredis-mock)

**Files:**
- Create: `web/src/lib/redis.ts`
- Create: `web/tests/unit/rate-limit.test.ts`
- Create: `web/src/lib/core/rate-limit.ts`

- [ ] **Step 1: Redis singleton（生产用 ioredis，测试在文件级 mock）**

`web/src/lib/redis.ts`:
```ts
import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis: Redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;
```

- [ ] **Step 2: 写 rate-limit 测试**

`web/tests/unit/rate-limit.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => {
  return { redis: new RedisMock() };
});

import { redis } from '@/lib/redis';
import { rateLimit } from '@/lib/core/rate-limit';

describe('rateLimit', () => {
  beforeEach(async () => {
    await (redis as any).flushall();
  });

  it('allows up to limit', async () => {
    for (let i = 0; i < 5; i++) {
      const ok = await rateLimit('k1', 5, 60);
      expect(ok).toBe(true);
    }
  });

  it('blocks once over limit', async () => {
    for (let i = 0; i < 5; i++) await rateLimit('k2', 5, 60);
    expect(await rateLimit('k2', 5, 60)).toBe(false);
  });

  it('isolates by key', async () => {
    for (let i = 0; i < 5; i++) await rateLimit('k3', 5, 60);
    expect(await rateLimit('k4', 5, 60)).toBe(true);
  });
});
```

- [ ] **Step 3: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/rate-limit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: 实现 rate-limit**

`web/src/lib/core/rate-limit.ts`:
```ts
import { redis } from '@/lib/redis';

/**
 * 简单滑动窗口：INCR + EXPIRE。
 * 返回 true = 允许，false = 限流。
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const k = `ratelimit:${key}`;
  const count = await redis.incr(k);
  if (count === 1) await redis.expire(k, windowSeconds);
  return count <= limit;
}
```

- [ ] **Step 5: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/rate-limit.test.ts
```

Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/redis.ts web/src/lib/core/rate-limit.ts web/tests/unit/rate-limit.test.ts
git commit -m "feat(core): redis singleton and rate-limit helper with ioredis-mock tests"
```

---

## Task 11: JWT 工具 (TDD)

**Files:**
- Create: `web/tests/unit/auth-jwt.test.ts`
- Create: `web/src/lib/core/auth.ts`

- [ ] **Step 1: 写失败测试**

`web/tests/unit/auth-jwt.test.ts`:
```ts
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
});

import { signUserToken, verifyUserToken } from '@/lib/core/auth';

describe('JWT', () => {
  it('signs and verifies a token', async () => {
    const token = await signUserToken({ uid: 'user-uuid', userId: 'AC10086234' });
    expect(token.split('.').length).toBe(3); // JWT 3 段

    const payload = await verifyUserToken(token);
    expect(payload.uid).toBe('user-uuid');
    expect(payload.userId).toBe('AC10086234');
  });

  it('rejects tampered token', async () => {
    const token = await signUserToken({ uid: 'u', userId: 'AC00000001' });
    const tampered = token.slice(0, -2) + 'xx';
    await expect(verifyUserToken(tampered)).rejects.toThrow();
  });

  it('rejects token signed with different secret', async () => {
    const token = await signUserToken({ uid: 'u', userId: 'AC00000001' });
    process.env.JWT_SECRET = 'different-secret-min-32-chars-abcdefgh';
    await expect(verifyUserToken(token)).rejects.toThrow();
    process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  });
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/auth-jwt.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 实现**

`web/src/lib/core/auth.ts`:
```ts
import { SignJWT, jwtVerify } from 'jose';

export interface UserTokenPayload {
  uid: string;       // db user.id (UUID)
  userId: string;    // public AC + 8 digits
}

const ALG = 'HS256';

function getUserSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set and >= 32 chars');
  return new TextEncoder().encode(s);
}

function getAdminSecret(): Uint8Array {
  const s = process.env.ADMIN_JWT_SECRET;
  if (!s || s.length < 32) throw new Error('ADMIN_JWT_SECRET must be set and >= 32 chars');
  return new TextEncoder().encode(s);
}

export async function signUserToken(payload: UserTokenPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(process.env.JWT_EXPIRES_IN ?? '7d')
    .sign(getUserSecret());
}

export async function verifyUserToken(token: string): Promise<UserTokenPayload> {
  const { payload } = await jwtVerify(token, getUserSecret(), { algorithms: [ALG] });
  return { uid: payload.uid as string, userId: payload.userId as string };
}

export interface AdminTokenPayload {
  aid: number;
  username: string;
  role: 'admin' | 'super_admin';
}

export async function signAdminToken(payload: AdminTokenPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(getAdminSecret());
}

export async function verifyAdminToken(token: string): Promise<AdminTokenPayload> {
  const { payload } = await jwtVerify(token, getAdminSecret(), { algorithms: [ALG] });
  return { aid: payload.aid as number, username: payload.username as string, role: payload.role as 'admin' | 'super_admin' };
}
```

- [ ] **Step 4: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/auth-jwt.test.ts
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/core/auth.ts web/tests/unit/auth-jwt.test.ts
git commit -m "feat(core): JWT sign/verify for user and admin tokens with jose"
```

---

## Task 12: SMS Client (interface + mock + tencent stub) (TDD)

**Files:**
- Create: `web/tests/unit/sms-mock.test.ts`
- Create: `web/src/lib/clients/sms/interface.ts`
- Create: `web/src/lib/clients/sms/mock.ts`
- Create: `web/src/lib/clients/sms/tencent.ts`
- Create: `web/src/lib/clients/sms/index.ts`

- [ ] **Step 1: 写失败测试（仅 mock 实现）**

`web/tests/unit/sms-mock.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockSmsClient } from '@/lib/clients/sms/mock';

describe('MockSmsClient', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('logs the code to stdout', async () => {
    const client = new MockSmsClient();
    await client.sendCode('13800138000', '123456', 'login');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[MOCK SMS]')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('13800138000')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('123456')
    );
  });
});

describe('SMS factory', () => {
  it('returns mock when MOCK_SMS=true', async () => {
    process.env.MOCK_SMS = 'true';
    const { getSmsClient } = await import('@/lib/clients/sms');
    const client = getSmsClient();
    expect(client.constructor.name).toBe('MockSmsClient');
  });
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/sms-mock.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 实现 interface**

`web/src/lib/clients/sms/interface.ts`:
```ts
export type SmsPurpose = 'login' | 'register';

export interface SmsClient {
  sendCode(phone: string, code: string, purpose: SmsPurpose): Promise<void>;
}
```

- [ ] **Step 4: 实现 MockSmsClient**

`web/src/lib/clients/sms/mock.ts`:
```ts
import type { SmsClient, SmsPurpose } from './interface';

export class MockSmsClient implements SmsClient {
  async sendCode(phone: string, code: string, purpose: SmsPurpose): Promise<void> {
    // 故意打到 stdout，方便 docker logs web 中肉眼读取
    console.log(`[MOCK SMS] phone=${phone} code=${code} purpose=${purpose}`);
  }
}
```

- [ ] **Step 5: 实现 TencentSmsClient（stub，未配置 creds 抛错）**

`web/src/lib/clients/sms/tencent.ts`:
```ts
import * as tencentcloud from 'tencentcloud-sdk-nodejs-sms';
import type { SmsClient, SmsPurpose } from './interface';
import { AppError, ErrCode } from '@/lib/core/errors';

const SmsClientSDK = tencentcloud.sms.v20210111.Client;

export class TencentSmsClient implements SmsClient {
  private client: InstanceType<typeof SmsClientSDK>;

  constructor() {
    const id = process.env.TENCENT_SMS_SECRET_ID;
    const key = process.env.TENCENT_SMS_SECRET_KEY;
    if (!id || !key) {
      throw new AppError(
        ErrCode.SmsSendFailed,
        'TENCENT_SMS_SECRET_ID/SECRET_KEY 未配置；请改用 MOCK_SMS=true 或填入凭证'
      );
    }
    this.client = new SmsClientSDK({
      credential: { secretId: id, secretKey: key },
      region: process.env.TENCENT_SMS_REGION ?? 'ap-guangzhou',
      profile: { httpProfile: { endpoint: 'sms.tencentcloudapi.com' } },
    });
  }

  async sendCode(phone: string, code: string, _purpose: SmsPurpose): Promise<void> {
    const appId = process.env.TENCENT_SMS_APP_ID;
    const sign = process.env.TENCENT_SMS_SIGN_NAME;
    const tmpl = process.env.TENCENT_SMS_TEMPLATE_ID;
    if (!appId || !sign || !tmpl) {
      throw new AppError(ErrCode.SmsSendFailed, 'TENCENT_SMS_APP_ID/SIGN/TEMPLATE 未配置');
    }
    const phoneNumber = phone.startsWith('+') ? phone : `+86${phone}`;
    const resp = await this.client.SendSms({
      PhoneNumberSet: [phoneNumber],
      SmsSdkAppId: appId,
      SignName: sign,
      TemplateId: tmpl,
      TemplateParamSet: [code, '5'], // {1}=code {2}=有效分钟
    });
    const status = resp.SendStatusSet?.[0];
    if (status?.Code !== 'Ok') {
      throw new AppError(
        ErrCode.SmsSendFailed,
        `腾讯云 SMS 失败: ${status?.Code} ${status?.Message}`
      );
    }
  }
}
```

- [ ] **Step 6: 实现 factory**

`web/src/lib/clients/sms/index.ts`:
```ts
import type { SmsClient } from './interface';
import { MockSmsClient } from './mock';
import { TencentSmsClient } from './tencent';

export type { SmsClient, SmsPurpose } from './interface';

let cached: SmsClient | undefined;

export function getSmsClient(): SmsClient {
  if (cached) return cached;
  cached = process.env.MOCK_SMS === 'true' ? new MockSmsClient() : new TencentSmsClient();
  return cached;
}

// 测试用：重置 factory 缓存
export function _resetSmsClient(): void {
  cached = undefined;
}
```

- [ ] **Step 7: 修测试以适配 cached factory**

替换 `web/tests/unit/sms-mock.test.ts` 的 SMS factory 测试：
```ts
describe('SMS factory', () => {
  it('returns mock when MOCK_SMS=true', async () => {
    process.env.MOCK_SMS = 'true';
    const mod = await import('@/lib/clients/sms');
    mod._resetSmsClient();
    const client = mod.getSmsClient();
    expect(client.constructor.name).toBe('MockSmsClient');
  });
});
```

- [ ] **Step 8: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/sms-mock.test.ts
```

Expected: PASS — 2 tests pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/clients/sms/ web/tests/unit/sms-mock.test.ts
git commit -m "feat(sms): mock + tencent client behind interface and factory"
```

---

## Task 13: zod 验证 schema (auth)

**Files:**
- Create: `web/src/lib/validation/auth.ts`

- [ ] **Step 1: 创建 schema**

`web/src/lib/validation/auth.ts`:
```ts
import { z } from 'zod';

// 中国大陆手机号
const PHONE_RE = /^1[3-9]\d{9}$/;

export const sendCodeSchema = z.object({
  phone: z.string().regex(PHONE_RE, '请输入有效的手机号'),
});

export const loginSchema = z.object({
  phone: z.string().regex(PHONE_RE, '请输入有效的手机号'),
  code: z.string().regex(/^\d{6}$/, '验证码必须是 6 位数字'),
});

export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 2: 加测试**

`web/tests/unit/validation-auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { sendCodeSchema, loginSchema } from '@/lib/validation/auth';

describe('sendCodeSchema', () => {
  it('accepts valid phone', () => {
    expect(sendCodeSchema.safeParse({ phone: '13800138000' }).success).toBe(true);
  });
  it('rejects invalid phone', () => {
    expect(sendCodeSchema.safeParse({ phone: '12300000000' }).success).toBe(false);
    expect(sendCodeSchema.safeParse({ phone: '1380013800' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid phone + 6-digit code', () => {
    expect(loginSchema.safeParse({ phone: '13800138000', code: '123456' }).success).toBe(true);
  });
  it('rejects non-6-digit code', () => {
    expect(loginSchema.safeParse({ phone: '13800138000', code: '12345' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '13800138000', code: 'abcdef' }).success).toBe(false);
  });
});
```

- [ ] **Step 3: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/validation-auth.test.ts
```

Expected: PASS — 4 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/validation/ web/tests/unit/validation-auth.test.ts
git commit -m "feat(validation): zod schemas for auth API"
```

---

## Task 14: POST /api/auth/send-code (TDD with integration test)

**Files:**
- Create: `web/src/app/api/auth/send-code/route.ts`
- Create: `web/tests/integration/auth-api.test.ts`
- Create: `web/tests/helpers/test-db.ts`

- [ ] **Step 1: 创建测试 DB 帮助函数**

`web/tests/helpers/test-db.ts`:
```ts
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
```

- [ ] **Step 2: 写 send-code 失败测试**

`web/tests/integration/auth-api.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

import { redis } from '@/lib/redis';
import { POST as sendCode } from '@/app/api/auth/send-code/route';
import { testPrisma, resetDb } from '../helpers/test-db';

beforeEach(async () => {
  process.env.MOCK_SMS = 'true';
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  await (redis as any).flushall();
  await resetDb();
});

function makeReq(body: unknown) {
  return new Request('http://localhost/api/auth/send-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/send-code', () => {
  it('sends a code and persists to DB', async () => {
    const res = await sendCode(makeReq({ phone: '13800138000' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.expire_in).toBe(300);

    const code = await testPrisma.smsCode.findFirst({ where: { phone: '13800138000' } });
    expect(code).toBeTruthy();
    expect(code!.code).toMatch(/^\d{6}$/);
    expect(code!.used).toBe(false);
  });

  it('rejects invalid phone', async () => {
    const res = await sendCode(makeReq({ phone: '12300000000' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rate-limits within 60 seconds (1 per phone)', async () => {
    const r1 = await sendCode(makeReq({ phone: '13800138000' }));
    expect((await r1.json()).code).toBe(0);
    const r2 = await sendCode(makeReq({ phone: '13800138000' }));
    expect((await r2.json()).code).not.toBe(0);
  });
});
```

- [ ] **Step 3: 跑测试，期望失败**

确保测试 DB 在跑：
```bash
cd /Users/benzema/code/ai-creative-tool
docker compose up -d postgres
sleep 2
cd web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/auth-api.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: 实现 send-code route**

`web/src/app/api/auth/send-code/route.ts`:
```ts
import type { NextRequest } from 'next/server';
import { ok, err } from '@/lib/core/http';
import { ErrCode, AppError } from '@/lib/core/errors';
import { rateLimit } from '@/lib/core/rate-limit';
import { sendCodeSchema } from '@/lib/validation/auth';
import { prisma } from '@/lib/db/prisma';
import { getSmsClient } from '@/lib/clients/sms';
import { randomInt } from 'node:crypto';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(ErrCode.InternalError, '请求体必须是 JSON');
  }

  const parsed = sendCodeSchema.safeParse(body);
  if (!parsed.success) {
    return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');
  }

  const { phone } = parsed.data;

  // 1 次/60 秒/phone
  const allowed = await rateLimit(`sms:${phone}`, 1, 60);
  if (!allowed) return err(ErrCode.SmsSendFailed, '请求过于频繁，请 60 秒后再试');

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expiredAt = new Date(Date.now() + 300_000);

  await prisma.smsCode.create({
    data: { phone, code, purpose: 'login', expiredAt },
  });

  try {
    await getSmsClient().sendCode(phone, code, 'login');
  } catch (e) {
    const msg = e instanceof AppError ? e.message : '短信发送失败';
    return err(ErrCode.SmsSendFailed, msg);
  }

  return ok({ expire_in: 300 }, '验证码已发送');
}
```

- [ ] **Step 5: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/auth-api.test.ts
```

Expected: PASS — 3 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/auth/send-code/ web/tests/
git commit -m "feat(api): POST /api/auth/send-code with rate limit and mock SMS"
```

---

## Task 15: POST /api/auth/login (TDD)

**Files:**
- Create: `web/src/app/api/auth/login/route.ts`
- Modify: `web/tests/integration/auth-api.test.ts` (加 login 测试)

- [ ] **Step 1: 加 login 测试**

在 `web/tests/integration/auth-api.test.ts` 末尾追加：
```ts
import { POST as login } from '@/app/api/auth/login/route';

function loginReq(body: unknown) {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function seedCode(phone: string, code: string) {
  await testPrisma.smsCode.create({
    data: { phone, code, purpose: 'login', expiredAt: new Date(Date.now() + 300_000) },
  });
}

describe('POST /api/auth/login', () => {
  it('auto-registers a new phone and returns is_new_user=true', async () => {
    await seedCode('13900139000', '654321');
    const res = await login(loginReq({ phone: '13900139000', code: '654321' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.is_new_user).toBe(true);
    expect(json.data.user_id).toMatch(/^AC\d{8}$/);
    expect(json.data.token).toBeTruthy();
    expect(res.headers.get('set-cookie')).toContain('auth-token=');

    const user = await testPrisma.user.findUnique({ where: { phone: '13900139000' } });
    expect(user).toBeTruthy();
    expect(user!.points).toBe(0);
  });

  it('logs in existing user without creating duplicate', async () => {
    await testPrisma.user.create({
      data: { userId: 'AC00000001', phone: '13900139000', points: 100 },
    });
    await seedCode('13900139000', '111111');

    const res = await login(loginReq({ phone: '13900139000', code: '111111' }));
    const json = await res.json();
    expect(json.data.is_new_user).toBe(false);
    expect(json.data.user_id).toBe('AC00000001');
    expect(json.data.points).toBe(100);

    const count = await testPrisma.user.count({ where: { phone: '13900139000' } });
    expect(count).toBe(1);
  });

  it('rejects wrong code', async () => {
    await seedCode('13900139000', '111111');
    const res = await login(loginReq({ phone: '13900139000', code: '999999' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rejects expired code', async () => {
    await testPrisma.smsCode.create({
      data: { phone: '13900139000', code: '111111', purpose: 'login', expiredAt: new Date(Date.now() - 1000) },
    });
    const res = await login(loginReq({ phone: '13900139000', code: '111111' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rejects already-used code', async () => {
    await testPrisma.smsCode.create({
      data: { phone: '13900139000', code: '111111', purpose: 'login', expiredAt: new Date(Date.now() + 60000), used: true },
    });
    const res = await login(loginReq({ phone: '13900139000', code: '111111' }));
    const json = await res.json();
    expect(json.code).not.toBe(0);
  });

  it('rejects banned user', async () => {
    await testPrisma.user.create({
      data: { userId: 'AC00000002', phone: '13700137000', points: 0, status: 'banned' },
    });
    await seedCode('13700137000', '222222');
    const res = await login(loginReq({ phone: '13700137000', code: '222222' }));
    const json = await res.json();
    expect(json.code).toBe(1003);
  });
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/auth-api.test.ts
```

Expected: FAIL — login route module not found.

- [ ] **Step 3: 实现 login route**

`web/src/app/api/auth/login/route.ts`:
```ts
import type { NextRequest } from 'next/server';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';
import { loginSchema } from '@/lib/validation/auth';
import { prisma } from '@/lib/db/prisma';
import { generateUserId } from '@/lib/core/user-id';
import { signUserToken } from '@/lib/core/auth';

const COOKIE_NAME = 'auth-token';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7d

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(ErrCode.InternalError, '请求体必须是 JSON');
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return err(ErrCode.InternalError, parsed.error.issues[0]?.message ?? '请求参数非法');
  }
  const { phone, code } = parsed.data;

  // 1. 查最新一条未用且未过期的 code
  const codeRow = await prisma.smsCode.findFirst({
    where: { phone, code, used: false, expiredAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!codeRow) return err(ErrCode.TokenInvalid, '验证码错误或已过期');

  // 2. 标记已用
  await prisma.smsCode.update({ where: { id: codeRow.id }, data: { used: true } });

  // 3. 找/建用户
  let user = await prisma.user.findUnique({ where: { phone } });
  let isNew = false;
  if (!user) {
    isNew = true;
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidateId = generateUserId();
      try {
        user = await prisma.user.create({ data: { userId: candidateId, phone } });
        break;
      } catch (e) {
        if (attempt === 2) throw e;
      }
    }
  }
  if (!user) return err(ErrCode.InternalError, '用户创建失败');

  if (user.status === 'banned') return err(ErrCode.AccountBanned, '账号已被封禁');

  // 4. 签 token
  const token = await signUserToken({ uid: user.id, userId: user.userId });

  // 5. 返回 + set-cookie
  const res = ok({
    user_id: user.userId,
    phone: maskPhone(user.phone),
    nickname: user.nickname,
    points: user.points,
    is_new_user: isNew,
    token,
  }, '登录成功');

  res.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax`
  );
  return res;
}
```

- [ ] **Step 4: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/auth-api.test.ts
```

Expected: PASS — 9 tests pass (3 send-code + 6 login).

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/auth/login/ web/tests/integration/auth-api.test.ts
git commit -m "feat(api): POST /api/auth/login with auto-register and JWT cookie"
```

---

## Task 16: withAuth middleware + /api/auth/me + /api/auth/logout (TDD)

**Files:**
- Create: `web/src/lib/middleware/with-auth.ts`
- Create: `web/src/app/api/auth/me/route.ts`
- Create: `web/src/app/api/auth/logout/route.ts`
- Modify: `web/tests/integration/auth-api.test.ts`

- [ ] **Step 1: 加 me + logout 测试**

在 `web/tests/integration/auth-api.test.ts` 末尾追加：
```ts
import { GET as me } from '@/app/api/auth/me/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { signUserToken } from '@/lib/core/auth';

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const req = new Request('http://localhost/api/auth/me');
    const res = await me(req as any);
    expect(res.status).toBe(401);
  });

  it('returns user info with valid cookie token', async () => {
    const user = await testPrisma.user.create({
      data: { userId: 'AC11111111', phone: '13700137000', points: 50 },
    });
    const token = await signUserToken({ uid: user.id, userId: user.userId });
    const req = new Request('http://localhost/api/auth/me', {
      headers: { cookie: `auth-token=${token}` },
    });
    const res = await me(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.user_id).toBe('AC11111111');
    expect(json.data.points).toBe(50);
  });

  it('returns 401 for tampered token', async () => {
    const req = new Request('http://localhost/api/auth/me', {
      headers: { cookie: 'auth-token=invalid.token.here' },
    });
    const res = await me(req as any);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the cookie', async () => {
    const req = new Request('http://localhost/api/auth/logout', { method: 'POST' });
    const res = await logout(req as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/auth-token=;.*Max-Age=0/);
  });
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/auth-api.test.ts
```

Expected: FAIL — me/logout not found.

- [ ] **Step 3: 实现 withAuth middleware**

`web/src/lib/middleware/with-auth.ts`:
```ts
import { NextResponse } from 'next/server';
import { parse as parseCookie } from 'cookie';
import { verifyUserToken, type UserTokenPayload } from '@/lib/core/auth';
import { ErrCode } from '@/lib/core/errors';
import { err } from '@/lib/core/http';

export interface AuthedReq extends Request {
  user: UserTokenPayload;
}

export async function getUserFromReq(req: Request): Promise<UserTokenPayload | null> {
  const cookieHeader = req.headers.get('cookie') ?? '';
  const cookies = parseCookie(cookieHeader);
  const token = cookies['auth-token'];
  if (!token) return null;
  try {
    return await verifyUserToken(token);
  } catch {
    return null;
  }
}

export async function withAuth(
  req: Request,
  handler: (req: Request, user: UserTokenPayload) => Promise<NextResponse>
): Promise<NextResponse> {
  const user = await getUserFromReq(req);
  if (!user) return err(ErrCode.Unauthorized, '请先登录');
  return handler(req, user);
}
```

- [ ] **Step 4: 实现 /api/auth/me**

`web/src/app/api/auth/me/route.ts`:
```ts
import { withAuth } from '@/lib/middleware/with-auth';
import { prisma } from '@/lib/db/prisma';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';

function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
}

export async function GET(req: Request) {
  return withAuth(req, async (_, user) => {
    const u = await prisma.user.findUnique({ where: { id: user.uid } });
    if (!u) return err(ErrCode.Unauthorized, '用户不存在');
    if (u.status === 'banned') return err(ErrCode.AccountBanned, '账号已被封禁');
    return ok({
      user_id: u.userId,
      phone: maskPhone(u.phone),
      nickname: u.nickname,
      avatar_url: u.avatarUrl,
      points: u.points,
    });
  });
}
```

- [ ] **Step 5: 实现 /api/auth/logout**

`web/src/app/api/auth/logout/route.ts`:
```ts
import { ok } from '@/lib/core/http';

export async function POST(_req: Request) {
  const res = ok({ logged_out: true });
  res.headers.append(
    'Set-Cookie',
    'auth-token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'
  );
  return res;
}
```

- [ ] **Step 6: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/auth-api.test.ts
```

Expected: PASS — 13 tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/middleware/ web/src/app/api/auth/me/ web/src/app/api/auth/logout/ web/tests/integration/auth-api.test.ts
git commit -m "feat(api): withAuth middleware + GET /me + POST /logout"
```

---

## Task 17: UI primitives — Button / Input / GlassCard

**Files:**
- Create: `web/src/components/ui/Button.tsx`
- Create: `web/src/components/ui/Input.tsx`
- Create: `web/src/components/ui/GlassCard.tsx`

- [ ] **Step 1: 安装 clsx（用于 className 合并）**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add clsx
```

- [ ] **Step 2: GlassCard**

`web/src/components/ui/GlassCard.tsx`:
```tsx
import type { HTMLAttributes, PropsWithChildren } from 'react';
import { clsx } from 'clsx';

interface Props extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function GlassCard({ children, className, ...rest }: PropsWithChildren<Props>) {
  return (
    <div
      className={clsx(
        'glass rounded-2xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.25)]',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 3: Button**

`web/src/components/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  loading,
  fullWidth,
  className,
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={clsx(
        'rounded-xl border px-5 py-3 font-medium transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'hover:scale-[1.02] active:scale-[0.98]',
        variant === 'primary' &&
          'border-white/20 bg-white/10 text-white hover:bg-white/15',
        variant === 'ghost' &&
          'border-transparent bg-transparent text-white/70 hover:text-white',
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? '处理中…' : children}
    </button>
  );
}
```

- [ ] **Step 4: Input**

`web/src/components/ui/Input.tsx`:
```tsx
import type { InputHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  prefix?: ReactNode;
}

export function Input({ prefix, className, ...rest }: Props) {
  return (
    <div className={clsx(
      'flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2',
      'focus-within:border-white/30',
      className
    )}>
      {prefix && <span className="mr-2 text-white/60">{prefix}</span>}
      <input
        className="flex-1 bg-transparent text-white placeholder:text-white/40 outline-none"
        {...rest}
      />
    </div>
  );
}
```

- [ ] **Step 5: 验证编译通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build
```

Expected: "Compiled successfully"

- [ ] **Step 6: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/components/ui/ web/package.json web/pnpm-lock.yaml
git commit -m "feat(ui): GlassCard / Button / Input primitives"
```

---

## Task 18: 登录页面 (`/login`)

**Files:**
- Create: `web/src/app/(public)/login/page.tsx`
- Create: `web/src/app/(public)/login/LoginForm.tsx`

- [ ] **Step 1: 服务端 page.tsx（已登录则重定向）**

`web/src/app/(public)/login/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyUserToken } from '@/lib/core/auth';
import { GlassCard } from '@/components/ui/GlassCard';
import { LoginForm } from './LoginForm';

export default async function LoginPage() {
  const token = cookies().get('auth-token')?.value;
  if (token) {
    try {
      await verifyUserToken(token);
      redirect('/dashboard');
    } catch {
      // token 无效，继续展示登录页
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <GlassCard className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-editorial text-4xl text-white">AI 智能创作</h1>
          <p className="mt-2 text-sm text-white/60">让创作更简单</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-white/40">
          登录即表示同意《用户协议》
        </p>
      </GlassCard>
    </main>
  );
}
```

- [ ] **Step 2: 客户端 LoginForm**

`web/src/app/(public)/login/LoginForm.tsx`:
```tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function LoginForm() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  async function sendCode() {
    setError(null);
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入有效的手机号');
      return;
    }
    const res = await fetch('/api/auth/send-code', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const json = await res.json();
    if (json.code !== 0) {
      setError(json.message);
      return;
    }
    setCountdown(60);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Input
        prefix="🇨🇳 +86"
        placeholder="请输入手机号"
        value={phone}
        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
        inputMode="numeric"
      />
      <div className="flex gap-2">
        <Input
          placeholder="请输入验证码"
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          className="flex-1"
        />
        <Button
          variant="ghost"
          disabled={countdown > 0 || phone.length !== 11}
          onClick={sendCode}
          className="whitespace-nowrap"
        >
          {countdown > 0 ? `${countdown}s` : '获取验证码'}
        </Button>
      </div>

      {error && <div className="text-sm text-red-400">{error}</div>}

      <Button
        fullWidth
        loading={submitting}
        disabled={phone.length !== 11 || code.length !== 6}
        onClick={submit}
      >
        登录 / 注册
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: 验证编译**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build
```

Expected: "Compiled successfully"

- [ ] **Step 4: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/\(public\)/
git commit -m "feat(ui): login page with phone + verification code form"
```

---

## Task 19: Dashboard 占位页（受保护）

**Files:**
- Create: `web/src/app/(auth)/layout.tsx`
- Create: `web/src/app/(auth)/dashboard/page.tsx`
- Create: `web/src/components/layout/Navbar.tsx`

- [ ] **Step 1: (auth) group layout（服务端检查 token）**

`web/src/app/(auth)/layout.tsx`:
```tsx
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyUserToken } from '@/lib/core/auth';
import { prisma } from '@/lib/db/prisma';
import { Navbar } from '@/components/layout/Navbar';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get('auth-token')?.value;
  if (!token) redirect('/login');

  let payload;
  try {
    payload = await verifyUserToken(token);
  } catch {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user || user.status === 'banned') redirect('/login');

  return (
    <>
      <Navbar
        userId={user.userId}
        points={user.points}
      />
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-8">{children}</main>
    </>
  );
}
```

- [ ] **Step 2: Navbar**

`web/src/components/layout/Navbar.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Props {
  userId: string;
  points: number;
}

export function Navbar({ userId, points }: Props) {
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-black/30 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/dashboard" className="font-editorial text-xl text-white">
          AI 智能创作
        </Link>
        <nav className="hidden gap-6 text-sm text-white/70 md:flex">
          <Link href="/dashboard" className="hover:text-white">工作台</Link>
          <Link href="/history" className="hover:text-white">使用记录</Link>
        </nav>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-white/80">🪙 {points.toLocaleString()}</span>
          <span className="hidden text-white/40 sm:inline">{userId}</span>
          <Link
            href="/recharge"
            className="rounded-lg border border-white/20 px-3 py-1 text-white/80 hover:bg-white/10"
          >
            充值
          </Link>
          <button
            onClick={logout}
            className="text-white/60 hover:text-white"
          >
            退出
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: dashboard placeholder page**

`web/src/app/(auth)/dashboard/page.tsx`:
```tsx
import { GlassCard } from '@/components/ui/GlassCard';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-editorial text-3xl text-white">工作台</h1>
        <p className="mt-1 text-sm text-white/60">视频文案提取 + 视频下载（P2 实现）</p>
      </div>
      <GlassCard>
        <p className="text-white/70">
          骨架已就绪。文案提取与视频下载功能将在 Plan 2 (P2) 实现。
        </p>
      </GlassCard>
    </div>
  );
}
```

- [ ] **Step 4: 验证编译**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build
```

Expected: "Compiled successfully"

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/\(auth\)/ web/src/components/layout/
git commit -m "feat(ui): protected dashboard placeholder + Navbar"
```

---

## Task 20: Playwright E2E — 完整登录流

**Files:**
- Create: `web/playwright.config.ts`
- Create: `web/tests/e2e/login.spec.ts`

- [ ] **Step 1: playwright config**

`web/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
  },
  webServer: {
    // 假设外部已经 docker compose up 起了 web；E2E 跑前先确认
    command: 'echo "expecting web on http://localhost:3000"',
    url: 'http://localhost:3000/login',
    reuseExistingServer: true,
    timeout: 5_000,
  },
});
```

- [ ] **Step 2: 装 playwright 浏览器**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm exec playwright install chromium
```

- [ ] **Step 3: 写 E2E test**

`web/tests/e2e/login.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

/**
 * E2E: 完整登录流。
 * 前提：docker compose up -d 已起；MOCK_SMS=true。
 * 验证码从 web 容器 stdout 读取。
 */
async function getMockCode(phone: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const p = spawn('docker', ['compose', 'logs', '--no-color', '--since=10s', 'web'], {
      cwd: '/Users/benzema/code/ai-creative-tool',
    });
    let buf = '';
    p.stdout.on('data', d => (buf += d.toString()));
    p.on('close', () => {
      const re = new RegExp(`\\[MOCK SMS\\] phone=${phone} code=(\\d{6})`);
      const m = buf.match(re);
      if (m) resolve(m[1]);
      else reject(new Error(`mock code for ${phone} not found in logs:\n${buf.slice(-500)}`));
    });
  });
}

test('user can login with phone + code', async ({ page }) => {
  const phone = `139${Math.floor(Math.random() * 100_000_000).toString().padStart(8, '0')}`;

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'AI 智能创作' })).toBeVisible();

  await page.getByPlaceholder('请输入手机号').fill(phone);
  await page.getByRole('button', { name: '获取验证码' }).click();

  // 等 1s 让 SMS 写入日志
  await page.waitForTimeout(1500);
  const code = await getMockCode(phone);

  await page.getByPlaceholder('请输入验证码').fill(code);
  await page.getByRole('button', { name: '登录 / 注册' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('heading', { name: '工作台' })).toBeVisible();
  await expect(page.locator('header')).toContainText('AC');
});
```

- [ ] **Step 4: 起 docker compose + 跑 E2E**

```bash
cd /Users/benzema/code/ai-creative-tool
docker compose up -d --build
sleep 10
# 等 web 容器启动 + migrate 完成；查看日志
docker compose logs --tail=20 web
```

确认 web 容器在 ":3000" 监听后：

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test:e2e
```

Expected: PASS — 1 test passed.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/playwright.config.ts web/tests/e2e/
git commit -m "test(e2e): playwright login flow with mock SMS code from docker logs"
```

---

## Task 21: README quickstart + final acceptance

**Files:**
- Modify: `/Users/benzema/code/ai-creative-tool/README.md`

- [ ] **Step 1: 重写 README 为完整 quickstart**

`/Users/benzema/code/ai-creative-tool/README.md`:
```markdown
# AI 智能创作

短视频文案提取 + 视频下载 Web 工具。基于 Next.js 14 + Postgres + Redis + yt-dlp。

> **当前进度**：P0 (骨架) + P1 (认证) 已完成。文案提取/视频下载/支付功能将在 Plan 2-4 中实现。

## Quick Start

\`\`\`bash
git clone <repo>
cd ai-creative-tool

# 1. 复制环境变量（默认 mock 模式，无需真实 API key）
cp .env.example .env

# 2. 启动所有服务
docker compose up -d --build

# 3. 等待 ~10 秒后打开
open http://localhost:3000
\`\`\`

## 测试登录流程

1. 在登录页输入任意 11 位手机号（如 \`13800138000\`）
2. 点击「获取验证码」
3. **从 docker logs 读取验证码**：
   \`\`\`bash
   docker compose logs --tail=20 web | grep "MOCK SMS"
   \`\`\`
   你会看到形如 \`[MOCK SMS] phone=13800138000 code=123456 purpose=login\` 的日志。
4. 输入验证码 → 登录成功，跳转到 dashboard

> 当 \`MOCK_SMS=false\` 并填入腾讯云凭证时，会走真实短信通道。

## 开发

### 技术栈
- 前端 + 后端：Next.js 14 (App Router) + TypeScript + Tailwind
- 数据库：PostgreSQL + Prisma
- 缓存 / 限流：Redis (ioredis)
- 视频处理：yt-dlp Python 微服务（FastAPI）+ ffmpeg.wasm 浏览器端
- 测试：vitest + supertest + playwright

### 目录
- \`web/\` — Next.js 应用
- \`ytdlp-service/\` — Python FastAPI 微服务
- \`docker-compose.yml\` — 一键启动 4 个容器

### 跑测试

\`\`\`bash
cd web

# 单元 + 集成测试（需要 postgres 在跑）
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" pnpm test

# E2E（需要 docker compose 在跑）
pnpm test:e2e
\`\`\`

### 切真实服务

编辑 \`.env\`：

| Var | 默认 | 切真实 |
|---|---|---|
| \`MOCK_SMS\` | true | 改 false + 填 \`TENCENT_SMS_*\` |
| \`MOCK_PAY\` | true | 改 false + 填 \`WECHAT_PAY_*\`（P3） |
| \`WHISPER_MODE\` | mock | \`openai\` 或 \`local\`（P2） |
| \`STORAGE\` | local | \`oss\` + 填 OSS keys（P3） |

## 设计文档

- Spec: \`docs/superpowers/specs/2026-04-18-ai-creative-tool-design.md\`
- Plans: \`docs/superpowers/plans/2026-04-18-ai-creative-tool-*.md\`
```

- [ ] **Step 2: 跑全部测试做最终验收**

```bash
cd /Users/benzema/code/ai-creative-tool
docker compose up -d
sleep 5
cd web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" pnpm test
pnpm test:e2e
pnpm build
```

Expected: 单元 + 集成全绿；E2E 通过；build 成功。

- [ ] **Step 3: 关闭服务 + 最终 commit**

```bash
cd /Users/benzema/code/ai-creative-tool
docker compose down
git add README.md
git commit -m "docs: README quickstart for P0 + P1 milestone"
```

- [ ] **Step 4: tag P1 完成**

```bash
cd /Users/benzema/code/ai-creative-tool
git tag -a v0.1.0-p1 -m "P0 + P1: skeleton + auth complete"
```

---

## 验收清单 (Plan 1 完成 = 满足以下全部)

- [ ] `docker compose up -d --build` 一键起 4 个容器（postgres/redis/ytdlp/web），全部 healthy
- [ ] `curl http://localhost:8000/health` → `{"ok":true,...}`
- [ ] 浏览器打开 http://localhost:3000 → 重定向到 `/login`
- [ ] 输入手机号 → 点「获取验证码」→ `docker compose logs web` 能看到 `[MOCK SMS]` 日志含 6 位验证码
- [ ] 输入验证码 → 登录成功 → 跳转 `/dashboard`，header 显示 `AC********` user ID 和 `🪙 0` 积分
- [ ] 点「退出」→ 回到 `/login`
- [ ] 直接访问 `/dashboard`（无 cookie）→ 重定向到 `/login`
- [ ] 单元测试全绿（`pnpm test` ≥ 18 tests pass）
- [ ] 集成测试全绿（auth-api.test.ts 13 tests pass）
- [ ] E2E 测试通过（`pnpm test:e2e` 1 test pass）
- [ ] `pnpm build` 成功，无 TypeScript 错误

---

## 下一步

Plan 1 完成后，写 **Plan 2 (P2)**：视频解析 + 文案提取 + 视频下载（含 ffmpeg.wasm 浏览器裁剪）。
