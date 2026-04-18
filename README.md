# AI 智能创作

短视频文案提取 + 视频下载 Web 工具。

## Quick Start

```bash
cp .env.example .env
docker compose up -d
```

打开 http://localhost:3000

## Architecture

见 `docs/superpowers/specs/2026-04-18-ai-creative-tool-design.md`

## 开发

- `web/` — Next.js 14 前后端
- `ytdlp-service/` — Python FastAPI 微服务

详见各子目录 README。
