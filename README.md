# AI 智能创作

短视频文案提取 + 视频下载 Web 工具。Next.js 14 + Postgres + Redis + Python FastAPI (yt-dlp) 微服务。

> **当前进度**：P0 + P1 + P2 已完成。支付 + 后台管理将在 Plan 3-4 实现。

## Quick Start (Docker — 推荐)

```bash
git clone <repo>
cd ai-creative-tool

# 1. 复制环境变量（默认 mock 模式，无需真实 API key）
cp .env.example .env

# 2. 启动所有服务
docker compose up -d --build

# 3. 等待 ~10 秒
open http://localhost:3000
```

## Quick Start (Native — Docker 不可用时)

适用于 macOS 没装 Docker 的开发场景。

```bash
# 1. 安装 + 启动 postgres + redis
brew install postgresql@16 redis ffmpeg
brew services start postgresql@16
brew services start redis

# 2. 创建数据库
psql -d postgres -c "CREATE USER ai_creative WITH PASSWORD 'dev_only_password' CREATEDB;"
psql -d postgres -c "CREATE DATABASE ai_creative OWNER ai_creative;"

# 3. .env 用本地地址
cp .env.example .env
sed -i '' 's|@postgres:5432|@localhost:5432|; s|redis://redis:6379|redis://localhost:6379|; s|http://ytdlp:8000|http://localhost:8000|' .env

# 4. 安装 web 依赖 + 跑 migration
cd web
pnpm install
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm prisma migrate deploy

# 5. 启动 web
pnpm dev
```

打开第二个终端启动 ytdlp-service：

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
uv sync
INTERNAL_API_TOKEN=$(grep INTERNAL_API_TOKEN ../.env | cut -d= -f2) \
TEMP_DIR=/tmp/ai-creative \
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

打开 http://localhost:3000

## 测试登录流程

1. 在登录页输入任意 11 位手机号（如 `13800138000`）
2. 点击「获取验证码」
3. **从控制台读取验证码**：
   - Docker 路径：`docker compose logs --tail=20 web | grep "MOCK SMS"`
   - Native 路径：直接看 `pnpm dev` 控制台输出（含 `[MOCK SMS] phone=... code=...`）
4. 输入验证码 → 登录成功，跳转到 dashboard

> 当 `MOCK_SMS=false` 并填入腾讯云凭证时，会走真实短信通道。

## 测试视频功能

1. 登录后在 dashboard，dev 模式下可调用 `POST /api/dev/grant-points?amount=100` 获得 100 积分（生产禁用）
2. 切换到「📝 文案提取」或「📥 视频下载」Tab
3. 粘贴抖音/小红书/B站/YouTube 链接
4. 点提取/解析按钮 → 等待 ytdlp-service 处理 → 看结果

> `WHISPER_MODE=mock` 时返回固定文案；`openai` 需配 `OPENAI_API_KEY`。

## 测试充值流程（mock 模式）

1. 登录 → 顶部 Navbar 点「充值」
2. 选择套餐 → 点「微信支付」→ 弹出二维码 + mock 提示
3. **5 秒后自动模拟支付成功** → 关闭弹窗 → 顶部积分自动刷新

## 开发

### 技术栈
- 前端 + 后端：Next.js 14 (App Router) + TypeScript + Tailwind
- 数据库：PostgreSQL + Prisma 6
- 缓存 / 限流：Redis (ioredis)
- 视频处理：yt-dlp Python 微服务（FastAPI）+ ffmpeg.wasm 浏览器端裁剪
- 转写：OpenAI Whisper API（mock / openai / local 三模式）
- 认证：jose (JWT) + httpOnly cookie
- 测试：vitest + supertest + playwright + pytest

### 目录
- `web/` — Next.js 应用
- `ytdlp-service/` — Python FastAPI 微服务
- `docker-compose.yml` — 一键启动 4 个容器

### 跑测试

```bash
# Web 单元 + 集成
cd web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" pnpm test

# Web E2E
pnpm test:e2e

# ytdlp-service 单元
cd ../ytdlp-service
.venv/bin/python -m pytest app/tests/ -v -m "not integration"
```

### 切真实服务

编辑 `.env`：

| Var | 默认 | 切真实 |
|---|---|---|
| `MOCK_SMS` | true | 改 false + 填 `TENCENT_SMS_*` |
| `MOCK_PAY` | true | 改 false + 填 `WECHAT_PAY_*`（P3） |
| `WHISPER_MODE` | mock | `openai` + `OPENAI_API_KEY` |
| `STORAGE` | local | `oss` + 填 OSS keys（P3） |

## 测试后台管理

1. 启动 web 服务后，控制台会打印随机生成的 admin 密码（如果 `.env` 没设 `ADMIN_INITIAL_PASSWORD`）
2. 打开 http://localhost:3000/admin/login
3. 用户名 `admin` + 控制台打印的密码
4. 首次登录强制改密 → 跳转到用户管理
5. 在用户管理页可：搜索用户 / 改积分 / 封禁解封
6. 在使用记录页可：筛选 / 导出 CSV

🎉 v1.0.0 完整商业化版骨架就绪。Mock 模式可立即体验；填入 微信支付 + 腾讯 SMS + OpenAI Whisper + 阿里云 OSS 凭证 即可切真实生产环境。

## 设计文档

- Spec: `docs/superpowers/specs/2026-04-18-ai-creative-tool-design.md`
- Plans: `docs/superpowers/plans/2026-04-18-ai-creative-tool-*.md`

## 已完成 Plan

- ✅ **Plan 1 (P0 + P1)**：骨架 + 认证 — 21 tasks
- ✅ **Plan 2 (P2)**：视频解析 + 文案提取 + ffmpeg.wasm 裁剪 — 17 tasks
- ✅ **Plan 3 (P3)**：积分充值 + 微信支付 (mock) — 8 tasks
- ✅ **Plan 4 (P4 + P5)**：后台管理 + 用户记录 — 10 tasks
