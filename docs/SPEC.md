# AI 智能创作 — 设计 Spec

> **来源**：用户 PRD `~/Downloads/PRD_AI智能创作.md` + 2026-04-18 brainstorming 对齐
> **Scope tier**：C — 完整商业化版（按 PRD 全做）
> **关键约束**：外部服务（SMS/支付/Whisper/OSS）走"双轨实现"，真服务接入 + mock fallback，env 切换
> **目标**：单 Docker Compose 本地可跑通完整业务流；上线发布不在本 spec 范围

---

## 1. 产品定位（沿用 PRD §1）

面向短视频内容创作者的 Web 工具：
- **文案提取**：粘贴短视频链接 → 一键提取口播文字
- **视频下载**：粘贴链接 → 解析 + 浏览器端 ffmpeg.wasm 片段裁剪 + 下载
- **支持平台**：抖音、小红书、B 站、YouTube
- **付费模式**：积分制，三档充值套餐（19.9 / 39.9 / 99.9 元）

---

## 2. Scope 边界（明确写出 IN/OUT，避免后续误解）

### IN-scope（本 spec 必须实现）

- 完整数据库 schema（6 张表）
- 完整页面（前台 4 页 + 后台 4 页），**响应式适配（最小宽度 375px）**
- 完整 API（认证 / 视频 / 积分 / 订单 / 历史 / 后台，共 ~17 个端点）
- 微信支付 Native API 真接入代码 + mock 模式
- 腾讯云 SMS 真接入代码 + mock 模式
- OpenAI Whisper API 真接入代码 + 本地 whisper.cpp 备份 + mock
- 阿里云 OSS 真接入代码 + 本地文件系统备份
- yt-dlp Python 微服务（FastAPI + Docker）
- 浏览器端 ffmpeg.wasm 视频裁剪
- Docker Compose 一键启动开发环境
- 单元 + 集成测试覆盖核心业务（积分原子事务、订单状态机、平台识别、JWT）
- E2E happy path（Playwright）

### OUT-of-scope（明确不做）

- ICP 备案、域名、HTTPS 证书申请（资质相关，与代码无关）
- 微信商户号注册、腾讯云 SMS 签名审核
- 生产服务器部署 Nginx 配置
- 用户协议 / 隐私政策文案
- 邮件通知、推送通知
- 多语言（i18n），中文写死
- A/B 实验、埋点
- 视频解析的"专业级反爬"（抖音/小红书 cookie 池、IP 代理）—— 留接口给后续 MediaCrawler 接入，本 spec 只接 yt-dlp
- 移动端 native app
- 客服 / 工单系统

### 偏离 PRD 的明确决策

| 项 | PRD 原文 | 本 spec 决策 | 理由 |
|---|---|---|---|
| 设计风格 | "苹果毛玻璃 Glassmorphism" | 保留毛玻璃骨架 + editorial typography (Fraunces serif 标题 + Inter Tight 正文)，去掉"紫蓝青"彩虹渐变 | 用户偏好"非土味设计" |
| 解析引擎 | yt-dlp 唯一 | yt-dlp 起步，**ParserService 抽象层**留 fallback 接口（MediaCrawler 后续可接） | 抖音/小红书 yt-dlp 经常失败 |
| 默认后台密码 | `admin123456` | 首次启动时从 env 读取，无 env 时随机生成并打到 console（强制改密） | 默认密码是安全雷点 |
| 临时文件存储 | "阿里云 OSS / 腾讯云 COS" | 默认本地文件系统（`/tmp/ai-creative`），OSS 是可选模式（`STORAGE=oss/local`） | 本地开发不需要云存储 |

---

## 3. 系统架构

### 3.1 容器拓扑

```
┌──────────────────────────────────────────────────────────────┐
│ docker-compose                                                │
│                                                              │
│  ┌────────────────┐   ┌────────────────┐                     │
│  │ web (Next.js)  │──▶│ ytdlp-service  │                     │
│  │ port 3000      │   │ (FastAPI)      │                     │
│  │                │   │ port 8000      │                     │
│  └────┬───────┬───┘   └────────┬───────┘                     │
│       │       │                │                             │
│       ▼       ▼                ▼                             │
│  ┌─────────┐ ┌────────┐  ┌──────────────┐                    │
│  │postgres │ │ redis  │  │ shared volume│                    │
│  │ port    │ │ port   │  │ /tmp/ai-     │                    │
│  │ 5432    │ │ 6379   │  │ creative     │                    │
│  └─────────┘ └────────┘  └──────────────┘                    │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 web 内部分层

```
Next.js 14 App Router
├── app/                   页面 (RSC + Client Components)
│   ├── (public)/login/    登录注册
│   ├── (auth)/dashboard/  工作台 (Tab: 文案提取 / 视频下载)
│   ├── (auth)/recharge/   充值
│   ├── (auth)/history/    使用记录
│   ├── admin/login/       后台登录
│   ├── admin/(authed)/*   后台 (用户/积分/记录)
│   └── api/*              API Routes
│
└── lib/
    ├── clients/           外部服务客户端 (real + mock 双实现)
    │   ├── sms/           tencent-sms.ts  + mock-sms.ts  + index.ts (factory)
    │   ├── pay/           wechat-pay.ts   + mock-pay.ts  + index.ts
    │   ├── whisper/       openai.ts       + local.ts     + mock.ts + index.ts
    │   ├── storage/       oss.ts          + local-fs.ts  + index.ts
    │   └── ytdlp/         http-client.ts (调 ytdlp-service)
    │
    ├── core/              业务核心
    │   ├── points.ts      原子事务 / consume / refund / adjust
    │   ├── orders.ts      订单状态机
    │   ├── auth.ts        JWT 签发/校验
    │   ├── platform.ts    URL → platform 识别
    │   ├── rate-limit.ts  Redis token bucket
    │   └── errors.ts      统一错误码
    │
    ├── db/                Prisma client
    └── middleware/        withAuth, withAdminAuth, withRateLimit, withCsrf
```

### 3.3 ytdlp-service 内部结构

```
ytdlp-service/
├── app/
│   ├── main.py           FastAPI app
│   ├── routes/
│   │   ├── extract.py    POST /extract-audio  → 返回音频文件路径
│   │   ├── parse.py      POST /parse-video    → 返回视频 meta
│   │   └── download.py   GET  /download/:token → 流式返回视频文件
│   ├── core/
│   │   ├── ytdlp_runner.py  调用 yt-dlp Python 库
│   │   ├── token.py         HMAC token 签发/校验
│   │   └── tempfile.py      临时文件管理
│   └── tests/
└── pyproject.toml
```

**与 web 的认证**：内部网络通信，共享 `INTERNAL_API_TOKEN` env，所有请求 header 带 `X-Internal-Token`。

---

## 4. 数据模型（Prisma Schema）

完全按 PRD §3 实现 6 张表，关键约束如下：

```prisma
// 关键摘要，实际 schema.prisma 在 plan 阶段细化
model User {
  id         String   @id @default(uuid()) @db.Uuid
  userId     String   @unique @db.VarChar(10)  // AC + 8 位数字
  phone      String   @unique @db.VarChar(20)
  nickname   String   @default("创作者") @db.VarChar(50)
  avatarUrl  String?  @db.VarChar(500)
  points     Int      @default(0)
  status     UserStatus @default(active)       // active | banned
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  pointTxns      PointTransaction[]
  orders         Order[]
  usageRecords   UsageRecord[]

  @@map("users")
}
// constraint: points >= 0  (DB CHECK)

model SmsCode {
  id        Int       @id @default(autoincrement())
  phone     String    @db.VarChar(20)
  code      String    @db.VarChar(6)
  purpose   SmsPurpose                          // login | register
  expiredAt DateTime
  used      Boolean   @default(false)
  createdAt DateTime  @default(now())
  @@index([phone, purpose])
  @@map("sms_codes")
}

model PointTransaction {
  id            Int      @id @default(autoincrement())
  userId        String   @db.Uuid
  type          PointTxnType                      // recharge | consume | admin_adjust
  amount        Int                               // 正/负
  balanceAfter  Int
  description   String?  @db.VarChar(200)
  relatedOrderId String?  @db.VarChar(100)
  createdAt     DateTime @default(now())
  user          User     @relation(fields: [userId], references: [id])
  @@index([userId, createdAt(sort: Desc)])
  @@map("point_transactions")
}

model Order {
  id              String   @id @default(uuid()) @db.Uuid
  orderNo         String   @unique @db.VarChar(32)
  userId          String   @db.Uuid
  packageType     PackageType                    // basic | standard | premium
  amountYuan      Decimal  @db.Decimal(10, 2)
  points          Int
  status          OrderStatus @default(pending)  // pending | paid | failed | refunded | expired | expired
  wechatPrepayId  String?  @db.VarChar(100)
  paidAt          DateTime?
  createdAt       DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id])
  @@index([userId, createdAt(sort: Desc)])
  @@map("orders")
}

model UsageRecord {
  id              Int      @id @default(autoincrement())
  userId          String   @db.Uuid
  type            UsageType                      // extract_text | download_video
  videoUrl        String   @db.VarChar(1000)
  platform        String   @db.VarChar(20)
  status          UsageStatus                    // success | failed
  pointsConsumed  Int      @default(0)
  resultText      String?  @db.Text
  resultFileUrl   String?  @db.VarChar(500)
  videoDuration   Int?
  errorMessage    String?  @db.VarChar(500)
  createdAt       DateTime @default(now())
  user            User     @relation(fields: [userId], references: [id])
  @@index([userId, createdAt(sort: Desc)])
  @@index([type, status])
  @@map("usage_records")
}

model AdminUser {
  id             Int      @id @default(autoincrement())
  username       String   @unique @db.VarChar(50)
  passwordHash   String   @db.VarChar(200)
  role           AdminRole @default(admin)      // admin | super_admin
  mustChangePassword Boolean @default(true)
  createdAt      DateTime @default(now())
  @@map("admin_users")
}
```

### 4.1 User ID 生成

`AC` + 8 位数字，注册时生成。冲突重试 3 次，仍冲突则抛错。

### 4.2 充值套餐常量（写死在代码）

```ts
const PACKAGES = {
  basic:    { yuan: 19.9, points: 2000 },
  standard: { yuan: 39.9, points: 5000 },
  premium:  { yuan: 99.9, points: 12000 },
} as const;
```

---

## 5. 外部服务双轨抽象

**核心模式**：每个外部服务定义一个 interface，提供 real + mock 至少两套实现，工厂函数按 env 选择。

### 5.1 SMS Client

```ts
// lib/clients/sms/index.ts
export interface SmsClient {
  sendCode(phone: string, code: string, purpose: 'login' | 'register'): Promise<void>;
}

// 工厂
export function getSmsClient(): SmsClient {
  return process.env.MOCK_SMS === 'true'
    ? new MockSmsClient()
    : new TencentSmsClient();
}

// MockSmsClient: 把 code 打到 web 容器 stdout (docker logs web)；不暴露读取 API
// TencentSmsClient: 真调腾讯云 SDK
```

### 5.2 Pay Client

```ts
export interface PayClient {
  createNativeOrder(input: CreateOrderInput): Promise<{ qrCodeUrl: string; prepayId: string }>;
  verifyCallback(headers, body): { orderNo: string; success: boolean };
}

// MockPayClient: 返回 data:image/png;base64,xxx 占位二维码 + 5s 后自动 POST 回调到 /api/order/wechat-callback
// WechatPayClient: 真调微信支付 V3 SDK
```

### 5.3 Whisper Client

```ts
export interface WhisperClient {
  transcribe(audioPath: string): Promise<{ text: string; language: string }>;
}

// 三种模式：
// - WHISPER_MODE=openai  → 调 OpenAI API
// - WHISPER_MODE=local   → 调本地 whisper.cpp (需要 docker 镜像装好模型)
// - WHISPER_MODE=mock    → 返回固定 "这是一段 mock 转写文本..."
```

### 5.4 Storage Client

```ts
export interface StorageClient {
  putTempFile(localPath: string, ttlSeconds: number): Promise<{ url: string; expiresAt: Date }>;
  cleanup(): Promise<number>;  // 返回清理了多少文件
}

// LocalFsStorageClient: 本地文件系统 + cron 清理
// OssStorageClient: 阿里云 OSS
```

### 5.5 客户端选择默认值

| Env Var | 默认 | 说明 |
|---|---|---|
| `MOCK_SMS` | `true` | 开发默认 mock，生产改 false |
| `MOCK_PAY` | `true` | 同上 |
| `WHISPER_MODE` | `mock` | 开发默认 mock |
| `STORAGE` | `local` | 默认本地存储 |

`.env.example` 提供完整模板。

---

## 6. 关键业务流（详细数据流）

### 6.1 文案提取（POST `/api/video/extract-text`）

```
Request: { video_url }
  ↓ withCsrf + withAuth + withRateLimit(10/min/user)
  ↓
1. platform = resolvePlatform(video_url)     // 失败 → 2001 错误
2. assert points >= 10                       // 失败 → 2010 积分不足
3. resp = await ytdlpClient.extractAudio(video_url)
   → { audioPath, title, duration, thumbnail }
4. assert duration <= 1800 (30 min)          // 失败 → 2002 时长超限
5. text = await whisperClient.transcribe(resp.audioPath)
6. await prisma.$transaction([
     SELECT points FROM users WHERE id=$uid FOR UPDATE,
     UPDATE users SET points = points - 10 WHERE id=$uid,
     INSERT point_transactions (consume, -10, balanceAfter, ...),
     INSERT usage_records (extract_text, success, video_url, platform, 10, text, duration, ...),
   ])
7. cleanup audioPath (异步)
8. Response: { code:0, data: { title, platform, duration, text, points_remaining } }

任意 step 3+ 失败：
  - 不扣积分
  - INSERT usage_records (status=failed, errorMessage)
  - 返回错误码 + 原因
```

### 6.2 视频下载两阶段

**阶段 1**：`POST /api/video/parse` → 后端解析 + 扣 20 积分 + 返回带 token 的下载 URL（指向 ytdlp-service）

**阶段 2**：浏览器
1. fetch 完整视频 → Blob
2. 用户拖滑块选片段
3. 若片段 ≠ 完整 → ffmpeg.wasm 裁剪
4. 触发 `<a download>` 下载

**关键**：积分在 `/parse` 时扣，下载阶段不再扣。下载链接 token 2h 过期。

### 6.3 充值订单状态机

```
            ┌─────────┐
   create   │ pending │  15min 超时
   ────────▶│         │──────────▶ expired (终态)
            └────┬────┘
                 │ wechat callback (paid notify)
                 │ verify signature
                 │ atomic: pending→paid
                 ▼
            ┌─────────┐
            │  paid   │  增加积分 + 流水
            └─────────┘
                 │ (后台手动)
                 ▼
            ┌──────────┐
            │ refunded │  减积分 + 流水
            └──────────┘
```

**幂等保证**：微信回调可能重复，用 `UPDATE orders SET status='paid' WHERE order_no=? AND status='pending'`，affectedRows=0 视为已处理。

### 6.4 浏览器端 ffmpeg.wasm 裁剪

- 库：`@ffmpeg/ffmpeg` v0.12 (multi-threaded build, 需要 SharedArrayBuffer，需要 Next.js 配 COOP/COEP headers)
- 命令：`ffmpeg -i input.mp4 -ss <start> -to <end> -c copy output.mp4`
- 文件大小限制：> 200MB 提示用户"视频过大，请下载完整版后本地裁剪"

---

## 7. 错误码规范

```
0      成功
1001   未登录 / token 过期
1002   token 非法
1003   账号已封禁
1004   后台权限不足
2001   不支持的视频平台
2002   视频时长超限（>30min）
2003   视频解析失败
2004   音频提取失败
2010   积分不足
2011   积分原子事务冲突（重试）
2020   订单不存在 / 已过期 / 已支付
3001   SMS 发送失败
3002   微信支付下单失败
3003   Whisper 转写失败
3004   yt-dlp 调用失败
9000   服务器内部错误
9001   外部依赖不可用（DB/Redis）
```

返回格式统一：
```json
{ "code": 2010, "message": "积分不足，当前 5 / 需要 10", "data": null }
```

---

## 8. 安全设计

| 项 | 方案 |
|---|---|
| JWT | httpOnly + Secure + SameSite=Lax cookie，7 天过期 |
| 后台 JWT | 独立 secret + path 隔离 (`/api/admin/*`) |
| CSRF | double-submit cookie 模式（mutation 请求带 `X-CSRF-Token` header） |
| Rate limit | Redis token bucket：发码 1/60s/phone，业务 API 10/min/user，登录 5/min/IP |
| URL 白名单 | 平台域名硬编码，正则匹配 |
| SQL 注入 | 100% 走 Prisma 参数化 |
| 微信支付签名 | 严格 V3 签名校验 |
| 临时文件 token | HMAC-SHA256，2h 过期 |
| 后台默认密码 | 启动时随机生成打 console + `mustChangePassword=true` |
| 密码存储 | bcrypt cost=12 |
| 输入校验 | zod schema，所有 API 入参 |
| 内部 service 通信 | `INTERNAL_API_TOKEN` header 校验 |

---

## 9. 测试策略

### 9.1 单元测试（Vitest）

**必须覆盖**：
- `lib/core/points.ts` — consume / refund / adjust 原子性、余额不足、并发
- `lib/core/orders.ts` — 状态机所有转换 + 幂等
- `lib/core/platform.ts` — 4 平台 URL 识别 + 异常 URL
- `lib/core/auth.ts` — JWT 签发/校验/过期
- `lib/clients/*/mock.ts` — mock 实现行为符合 interface

### 9.2 集成测试（Vitest + supertest）

**所有 API 端点**用 mock client 跑：
- 认证流（发码/登录/登出/me）
- 文案提取 happy path + 积分不足 + 时长超限 + Whisper 失败
- 视频解析 + 下载 token
- 订单创建 + 回调（包括重复回调）
- 后台所有 CRUD

### 9.3 E2E（Playwright）

**只跑核心 happy path**：
1. 登录（mock SMS）→ dashboard 显示 0 积分
2. 后台手动加 100 积分
3. 提取文案 → 显示结果，积分变 90
4. 充值 standard（mock pay）→ 5s 自动回调 → 积分变 5090

### 9.4 ytdlp-service 测试（pytest）

- 平台识别 + token 签发/校验
- yt-dlp 调用用 mock（不真的去下载，跑 CI 太慢）
- 一个真实 YouTube 短视频的 smoke test（标记 `@pytest.mark.integration`，CI 默认跳过）

---

## 10. 部署 / 环境

### 10.1 docker-compose.yml 服务

```yaml
services:
  web:        # Next.js 3000
  ytdlp:      # FastAPI 8000
  postgres:   # 5432
  redis:      # 6379

volumes:
  postgres-data:
  redis-data:
  temp-files:  # 共享 /tmp/ai-creative
```

### 10.2 .env.example 关键变量

完全列出 PRD §9 + 新增的 mock 开关。生产环境需手动改：
- `MOCK_SMS=false` + 填腾讯云 keys
- `MOCK_PAY=false` + 填微信商户号 + 上传证书
- `WHISPER_MODE=openai` + 填 OPENAI_API_KEY
- `STORAGE=oss` + 填 OSS keys（如果要 OSS）

### 10.3 临时文件清理

由 ytdlp-service 用 APScheduler 内部每小时跑一次，删除 `/tmp/ai-creative` 中 mtime > `TEMP_FILE_MAX_AGE` 秒的文件（默认 7200）。

`scripts/cleanup-temp.sh` 作为手动应急脚本保留，逻辑相同。

### 10.4 不在本 spec 范围

- Nginx / HTTPS / 域名 / 备案
- 生产服务器选型 / 监控 / 日志聚合
- 数据库备份策略

---

## 11. 项目目录结构

```
ai-creative-tool/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── README.md
├── CHANGELOG.md
│
├── web/
│   ├── package.json
│   ├── next.config.js              (含 COOP/COEP for ffmpeg.wasm)
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts                 (开发种子数据：1 个 admin + 2 个测试用户)
│   ├── src/
│   │   ├── app/                    (页面 + API，按 §3.2 结构)
│   │   ├── components/
│   │   │   ├── ui/                 (Button, Input, Card, Modal, Toast)
│   │   │   ├── layout/             (Navbar, Sidebar, GlassCard)
│   │   │   └── features/           (TextExtractor, VideoDownloader, VideoTrimmer, PaymentModal)
│   │   ├── lib/
│   │   │   ├── clients/            (sms/pay/whisper/storage/ytdlp)
│   │   │   ├── core/               (points/orders/auth/platform/rate-limit/errors)
│   │   │   ├── db/                 (prisma client)
│   │   │   └── middleware/
│   │   ├── hooks/
│   │   ├── styles/
│   │   └── types/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   └── Dockerfile
│
├── ytdlp-service/
│   ├── pyproject.toml
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/
│   │   ├── core/
│   │   └── tests/
│   └── Dockerfile
│
└── scripts/
    └── cleanup-temp.sh
```

---

## 12. 实施分期（粗粒度，细节走 plan）

| Phase | 范围 | 验收标准 |
|---|---|---|
| **P0 — 骨架** | repo init / docker-compose / prisma schema / 毛玻璃 UI 库 | `docker-compose up` 起所有服务 + 空白 dashboard 可访问 |
| **P1 — 认证** | SMS client (mock+real) + JWT + login/register API + login UI | 用 mock SMS 完整登录流跑通 |
| **P2 — 视频功能** | ytdlp-service + extract-text + parse + ffmpeg.wasm 裁剪 + dashboard UI | 用真实 YouTube 链接跑通文案提取 + 视频下载 |
| **P3 — 积分 & 支付** | points core + order state machine + WeChat Pay (mock+real) + recharge UI | mock 支付 5s 后自动到账 + 积分流水正确 |
| **P4 — 历史 & 后台** | history page + admin login + 后台 4 个页面 + CSV 导出 | 后台能改积分/封禁/导出 |
| **P5 — 测试 & 加固** | 单元+集成+E2E 全跑 + 错误处理 + rate limit + 安全加固 | CI 全绿 + 安全 checklist 过 |

> 详细任务粒度走 plan。每个 Phase 结束有 git tag。

---

## 13. 已知风险 / 待用户后续决策

1. **抖音/小红书 yt-dlp 实际成功率未知** — 上线前需要做真实链接 smoke 测试，必要时接入 MediaCrawler
2. **ffmpeg.wasm SharedArrayBuffer 要求** — 需要正确配置 COOP/COEP headers，影响第三方资源加载
3. **OpenAI Whisper 国内网络** — 生产服务器在国内时需要走代理；本地 whisper.cpp 是 fallback
4. **微信支付资质** — 用户需自行办理商户号，本 spec 只保证代码能切真服务
5. **ICP 备案** — 域名解析到国内服务器前必须备案，与代码无关，用户自行处理
6. **后台密码策略** — 是否要加密码强度校验、二次验证（短信/邮箱）？本 spec 只做 bcrypt + 强制改密，更复杂的留后续

---

## 14. 验收清单（spec 完成 = 满足以下全部）

- [ ] Docker Compose 一键起 4 个服务
- [ ] 完整登录注册流（mock SMS）
- [ ] 真实 YouTube 短视频文案提取成功
- [ ] 真实 YouTube 短视频解析 + 浏览器裁剪 + 下载成功
- [ ] mock 支付 → 积分到账正确
- [ ] 后台能改用户积分、封禁、导出 CSV
- [ ] 单元 + 集成测试 100% 通过
- [ ] E2E happy path 通过
- [ ] `.env.example` 完整 + `README.md` 含 quickstart
- [ ] 所有外部 client 切真服务的入口存在（不需要真测，但代码完整）
