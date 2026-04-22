# AI 智能创作 — Plan 2 (P2)：视频功能

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 完整实现「文案提取」与「视频下载」两大核心功能。粘贴抖音/小红书/B站/YouTube 链接 → 后端 yt-dlp 解析 → Whisper 转写文案 / 浏览器 ffmpeg.wasm 裁剪 → 用户拿到结果 + 扣积分。

**Architecture:** ytdlp-service (Python FastAPI + yt-dlp + ffmpeg) 处理视频解析与音频提取；web (Next.js) 通过内部 HTTP 调用 ytdlp-service；Whisper API 转写音频；浏览器端 ffmpeg.wasm 做片段裁剪（避免服务端压力）。所有外部服务（Whisper / Storage）走 interface + factory 双轨。

**Tech Stack:** Python 3.11 + FastAPI + uvicorn + yt-dlp + ffmpeg + APScheduler + httpx，Node 端 OpenAI SDK + 现有 Next.js 14 stack，浏览器端 @ffmpeg/ffmpeg @ffmpeg/util (multi-thread build).

**Spec reference:** `docs/superpowers/specs/2026-04-18-ai-creative-tool-design.md` §3.3, §5.3, §5.4, §6.1, §6.2, §6.4, §6.5.

**Repo:** `/Users/benzema/code/ai-creative-tool/` (continuing from `v0.1.0-p1` tag).

---

## File Structure (Plan 2 全部产出)

```
ai-creative-tool/
├── ytdlp-service/              # 升级 stub → 完整服务
│   ├── pyproject.toml          # 添加 yt-dlp / httpx / pyjwt / apscheduler
│   ├── Dockerfile              # 加 ffmpeg + yt-dlp
│   ├── app/
│   │   ├── main.py             # 注册 routers + 启动 cleanup scheduler
│   │   ├── core/
│   │   │   ├── token.py        # HMAC sign/verify (内部 token + download token)
│   │   │   ├── tempfile.py     # 临时文件管理 + cleanup
│   │   │   ├── ytdlp_runner.py # yt-dlp Python 库封装
│   │   │   └── auth.py         # X-Internal-Token middleware
│   │   ├── routes/
│   │   │   ├── extract.py      # POST /extract-audio
│   │   │   ├── parse.py        # POST /parse-video
│   │   │   └── download.py     # GET /download/:token
│   │   └── tests/
│   │       ├── test_token.py
│   │       ├── test_ytdlp_runner.py    # 含一个真实 YT 短视频 smoke test (mark integration)
│   │       └── test_routes.py
│
└── web/
    └── src/
        ├── lib/
        │   ├── core/
        │   │   ├── platform.ts        # URL → 平台识别
        │   │   └── points.ts          # 积分原子事务 (consume/refund/adjust)
        │   ├── clients/
        │   │   ├── ytdlp/
        │   │   │   └── http-client.ts # 调 ytdlp-service
        │   │   ├── whisper/
        │   │   │   ├── interface.ts
        │   │   │   ├── mock.ts
        │   │   │   ├── openai.ts
        │   │   │   ├── local.ts       # whisper.cpp via subprocess (P2 stub, throws)
        │   │   │   └── index.ts
        │   │   └── storage/
        │   │       ├── interface.ts
        │   │       ├── local-fs.ts
        │   │       ├── oss.ts          # P2 stub
        │   │       └── index.ts
        │   └── middleware/
        │       └── with-rate-limit.ts # 通用限流 wrapper (10/min/user)
        │
        ├── app/
        │   ├── api/
        │   │   └── video/
        │   │       ├── extract-text/route.ts
        │   │       ├── parse/route.ts
        │   │       └── download/route.ts
        │   └── (auth)/dashboard/
        │       ├── page.tsx           # 整页改：Tab 切换 + 渲染两个组件
        │       └── DashboardTabs.tsx
        │
        └── components/
            └── features/
                ├── TextExtractor.tsx
                ├── VideoDownloader.tsx
                ├── VideoTrimmer.tsx   # 双滑块 + ffmpeg.wasm 裁剪
                └── ResultPanel.tsx
```

```
tests/
├── unit/
│   ├── platform.test.ts
│   ├── points.test.ts
│   └── whisper-mock.test.ts
└── integration/
    └── video-api.test.ts
└── e2e/
    └── extract-text.spec.ts
```

---

## Conventions

- 所有 task 末尾 `git commit`
- TDD：所有业务逻辑（platform, points, API routes, ytdlp_runner）先写测试
- 所有数据库测试在跑前确保 postgres 就绪：`brew services list | grep postgresql@16`
- Whisper / 真 yt-dlp 调用需要外部资源 — 测试默认用 mock，真调用走 `pytest -m integration` 单独跑
- 跨 service 通信用 `INTERNAL_API_TOKEN` env 校验

---

## Task 1: ytdlp-service 升级依赖（yt-dlp + ffmpeg + 业务依赖）

**Files:**
- Modify: `ytdlp-service/pyproject.toml`
- Modify: `ytdlp-service/Dockerfile`

- [ ] **Step 1: 更新 pyproject.toml**

`ytdlp-service/pyproject.toml`:
```toml
[project]
name = "ytdlp-service"
version = "0.2.0"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.111",
    "uvicorn[standard]>=0.30",
    "pydantic>=2.7",
    "yt-dlp>=2026.1.1",
    "apscheduler>=3.10",
    "httpx>=0.27",
]

[tool.uv]
dev-dependencies = [
    "pytest>=8",
    "pytest-asyncio>=0.23",
    "httpx>=0.27",
]

[tool.pytest.ini_options]
markers = [
    "integration: marks tests requiring real yt-dlp/network (deselect with '-m \"not integration\"')",
]
asyncio_mode = "auto"
```

- [ ] **Step 2: 更新 Dockerfile（加 ffmpeg）**

`ytdlp-service/Dockerfile`:
```dockerfile
FROM python:3.11-slim

# 系统依赖：ffmpeg (yt-dlp 后处理需要)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN pip install --no-cache-dir \
    "fastapi>=0.111" \
    "uvicorn[standard]>=0.30" \
    "pydantic>=2.7" \
    "yt-dlp>=2026.1.1" \
    "apscheduler>=3.10" \
    "httpx>=0.27"

COPY app ./app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 3: 本地 venv 安装（用 uv）**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
uv sync 2>&1 | tail -5
```

(若没有 `uv.lock` 就先 `uv lock`。)

Expected: 创建 `.venv/` + 安装所有依赖。

- [ ] **Step 4: 验证 yt-dlp 装好**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
.venv/bin/python -c "import yt_dlp; print(yt_dlp.version.__version__)"
```

Expected: 打印一个版本号（≥2026.x）。

- [ ] **Step 5: 验证 ffmpeg 可用**

```bash
which ffmpeg && ffmpeg -version 2>&1 | head -1
```

如果本机没有 ffmpeg，安装：
```bash
brew install ffmpeg
```
（仅本地需要；Docker 镜像内已带）

- [ ] **Step 6: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add ytdlp-service/pyproject.toml ytdlp-service/Dockerfile ytdlp-service/uv.lock 2>/dev/null
git commit -m "chore(ytdlp): add yt-dlp + ffmpeg + apscheduler deps"
```

---

## Task 2: ytdlp-service token utility (TDD)

**Files:**
- Create: `ytdlp-service/app/core/__init__.py`
- Create: `ytdlp-service/app/core/token.py`
- Create: `ytdlp-service/app/tests/__init__.py`
- Create: `ytdlp-service/app/tests/test_token.py`

- [ ] **Step 1: 创建 __init__.py 文件**

```bash
mkdir -p /Users/benzema/code/ai-creative-tool/ytdlp-service/app/core
mkdir -p /Users/benzema/code/ai-creative-tool/ytdlp-service/app/tests
touch /Users/benzema/code/ai-creative-tool/ytdlp-service/app/core/__init__.py
touch /Users/benzema/code/ai-creative-tool/ytdlp-service/app/tests/__init__.py
```

- [ ] **Step 2: 写失败测试**

`ytdlp-service/app/tests/test_token.py`:
```python
import os
import pytest
from app.core.token import sign_download_token, verify_download_token, TokenExpired, TokenInvalid

@pytest.fixture(autouse=True)
def setup_secret(monkeypatch):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-secret-32-chars-12345678901234567890")

def test_sign_and_verify():
    token = sign_download_token("/tmp/file.mp4", ttl_seconds=60)
    payload = verify_download_token(token)
    assert payload["path"] == "/tmp/file.mp4"

def test_tampered_rejected():
    token = sign_download_token("/tmp/file.mp4", ttl_seconds=60) + "x"
    with pytest.raises(TokenInvalid):
        verify_download_token(token)

def test_expired_rejected():
    token = sign_download_token("/tmp/file.mp4", ttl_seconds=-1)  # 已过期
    with pytest.raises(TokenExpired):
        verify_download_token(token)

def test_path_mismatch_caught():
    token1 = sign_download_token("/tmp/a.mp4", ttl_seconds=60)
    payload = verify_download_token(token1)
    assert payload["path"] == "/tmp/a.mp4"
    # 不能用 a 的 token 拿 b 的文件 — 由调用方比对 path
```

- [ ] **Step 3: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
.venv/bin/python -m pytest app/tests/test_token.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 4: 实现**

`ytdlp-service/app/core/token.py`:
```python
"""HMAC-signed download tokens for serving temporary video files."""
import os
import json
import time
import hmac
import hashlib
import base64


class TokenInvalid(Exception):
    pass


class TokenExpired(Exception):
    pass


def _secret() -> bytes:
    s = os.environ.get("INTERNAL_API_TOKEN", "")
    if len(s) < 16:
        raise RuntimeError("INTERNAL_API_TOKEN must be set and >= 16 chars")
    return s.encode("utf-8")


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(s: str) -> bytes:
    padding = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + padding)


def sign_download_token(path: str, ttl_seconds: int = 7200) -> str:
    payload = {"path": path, "exp": int(time.time()) + ttl_seconds}
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    sig = hmac.new(_secret(), payload_bytes, hashlib.sha256).digest()
    return f"{_b64encode(payload_bytes)}.{_b64encode(sig)}"


def verify_download_token(token: str) -> dict:
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        payload_bytes = _b64decode(payload_b64)
        sig = _b64decode(sig_b64)
    except Exception as e:
        raise TokenInvalid(f"malformed token: {e}")

    expected = hmac.new(_secret(), payload_bytes, hashlib.sha256).digest()
    if not hmac.compare_digest(sig, expected):
        raise TokenInvalid("signature mismatch")

    payload = json.loads(payload_bytes.decode("utf-8"))
    if payload.get("exp", 0) < int(time.time()):
        raise TokenExpired("token expired")
    return payload
```

- [ ] **Step 5: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
.venv/bin/python -m pytest app/tests/test_token.py -v
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add ytdlp-service/app/
git commit -m "feat(ytdlp): HMAC download token sign/verify with TTL"
```

---

## Task 3: ytdlp-service tempfile + ytdlp_runner (TDD with mocks)

**Files:**
- Create: `ytdlp-service/app/core/tempfile.py`
- Create: `ytdlp-service/app/core/ytdlp_runner.py`
- Create: `ytdlp-service/app/tests/test_ytdlp_runner.py`

- [ ] **Step 1: 写测试（含 mock + 真实 integration 标记）**

`ytdlp-service/app/tests/test_ytdlp_runner.py`:
```python
import os
import pytest
from unittest.mock import patch, MagicMock
from app.core.ytdlp_runner import extract_audio, parse_video, YtdlpError


def test_extract_audio_calls_ytdlp_with_audio_format():
    """yt-dlp 应该被调用并返回元数据 + 文件路径"""
    fake_info = {"title": "T", "duration": 60, "thumbnail": "http://x/t.jpg"}
    with patch("app.core.ytdlp_runner.YoutubeDL") as MockYDL:
        ctx = MockYDL.return_value.__enter__.return_value
        ctx.extract_info.return_value = fake_info
        ctx.prepare_filename.return_value = "/tmp/test/audio.mp3"
        with patch("os.path.exists", return_value=True):
            result = extract_audio("https://www.youtube.com/watch?v=x", "/tmp/test")

        assert result["title"] == "T"
        assert result["duration"] == 60
        assert result["audio_path"] == "/tmp/test/audio.mp3"


def test_parse_video_returns_meta_and_video_path():
    fake_info = {
        "title": "Test",
        "duration": 120,
        "thumbnail": "http://x/t.jpg",
        "ext": "mp4",
    }
    with patch("app.core.ytdlp_runner.YoutubeDL") as MockYDL:
        ctx = MockYDL.return_value.__enter__.return_value
        ctx.extract_info.return_value = fake_info
        ctx.prepare_filename.return_value = "/tmp/test/video.mp4"
        with patch("os.path.exists", return_value=True):
            result = parse_video("https://example.com/x", "/tmp/test")

        assert result["title"] == "Test"
        assert result["duration"] == 120
        assert result["video_path"] == "/tmp/test/video.mp4"


def test_extract_audio_raises_on_ytdlp_error():
    from yt_dlp.utils import DownloadError
    with patch("app.core.ytdlp_runner.YoutubeDL") as MockYDL:
        ctx = MockYDL.return_value.__enter__.return_value
        ctx.extract_info.side_effect = DownloadError("no video found")
        with pytest.raises(YtdlpError):
            extract_audio("https://bad.url/x", "/tmp/test")


@pytest.mark.integration
def test_real_youtube_extract_audio(tmp_path):
    """真实 YT 短视频 smoke test — 默认跳过；用 `pytest -m integration` 跑"""
    # Rick Astley - Never Gonna Give You Up (公认稳定的测试视频)
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    result = extract_audio(url, str(tmp_path))
    assert result["title"]
    assert result["duration"] > 0
    assert os.path.exists(result["audio_path"])
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
.venv/bin/python -m pytest app/tests/test_ytdlp_runner.py -v -m "not integration"
```

Expected: FAIL — module not found.

- [ ] **Step 3: 实现 tempfile**

`ytdlp-service/app/core/tempfile.py`:
```python
"""Temporary file management."""
import os
import time
import shutil
from pathlib import Path


def get_temp_dir() -> str:
    d = os.environ.get("TEMP_DIR", "/tmp/ai-creative")
    os.makedirs(d, exist_ok=True)
    return d


def make_session_dir() -> str:
    """每个请求一个独立子目录，便于事后清理。"""
    parent = get_temp_dir()
    name = f"sess-{int(time.time() * 1000)}-{os.urandom(4).hex()}"
    p = os.path.join(parent, name)
    os.makedirs(p, exist_ok=True)
    return p


def cleanup_old_files(max_age_seconds: int) -> int:
    """删除 mtime > max_age_seconds 的子目录。返回删除数量。"""
    parent = get_temp_dir()
    now = time.time()
    deleted = 0
    if not os.path.isdir(parent):
        return 0
    for entry in os.listdir(parent):
        full = os.path.join(parent, entry)
        try:
            stat = os.stat(full)
            if now - stat.st_mtime > max_age_seconds:
                if os.path.isdir(full):
                    shutil.rmtree(full, ignore_errors=True)
                else:
                    os.remove(full)
                deleted += 1
        except FileNotFoundError:
            pass
    return deleted
```

- [ ] **Step 4: 实现 ytdlp_runner**

`ytdlp-service/app/core/ytdlp_runner.py`:
```python
"""Wrap yt-dlp Python library calls."""
import os
from yt_dlp import YoutubeDL
from yt_dlp.utils import DownloadError


class YtdlpError(Exception):
    pass


def _common_opts(out_dir: str) -> dict:
    return {
        "outtmpl": os.path.join(out_dir, "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "no_color": True,
    }


def extract_audio(url: str, out_dir: str) -> dict:
    """提取音频。返回 { title, duration, thumbnail, audio_path }"""
    opts = {
        **_common_opts(out_dir),
        "format": "bestaudio/best",
        "postprocessors": [
            {"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "128"}
        ],
    }
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            # postprocessor 改了扩展名
            audio_path = os.path.splitext(filename)[0] + ".mp3"
            if not os.path.exists(audio_path):
                # fallback：直接用原文件
                audio_path = filename
            return {
                "title": info.get("title", ""),
                "duration": info.get("duration", 0) or 0,
                "thumbnail": info.get("thumbnail", ""),
                "audio_path": audio_path,
            }
    except DownloadError as e:
        raise YtdlpError(f"yt-dlp failed: {e}")


def parse_video(url: str, out_dir: str) -> dict:
    """下载完整视频。返回 { title, duration, thumbnail, video_path, ext }"""
    opts = {
        **_common_opts(out_dir),
        "format": "best[ext=mp4]/best",
    }
    try:
        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            return {
                "title": info.get("title", ""),
                "duration": info.get("duration", 0) or 0,
                "thumbnail": info.get("thumbnail", ""),
                "video_path": filename,
                "ext": info.get("ext", "mp4"),
            }
    except DownloadError as e:
        raise YtdlpError(f"yt-dlp failed: {e}")
```

- [ ] **Step 5: 跑测试**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
.venv/bin/python -m pytest app/tests/test_ytdlp_runner.py -v -m "not integration"
```

Expected: 3 tests pass (4 total, 1 marked integration skipped).

- [ ] **Step 6: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add ytdlp-service/app/
git commit -m "feat(ytdlp): tempfile manager + yt-dlp runner with audio/video extraction"
```

---

## Task 4: ytdlp-service auth middleware + 3 routes (TDD)

**Files:**
- Create: `ytdlp-service/app/core/auth.py`
- Create: `ytdlp-service/app/routes/__init__.py`
- Create: `ytdlp-service/app/routes/extract.py`
- Create: `ytdlp-service/app/routes/parse.py`
- Create: `ytdlp-service/app/routes/download.py`
- Modify: `ytdlp-service/app/main.py`
- Create: `ytdlp-service/app/tests/test_routes.py`

- [ ] **Step 1: 创建 routes init**

```bash
mkdir -p /Users/benzema/code/ai-creative-tool/ytdlp-service/app/routes
touch /Users/benzema/code/ai-creative-tool/ytdlp-service/app/routes/__init__.py
```

- [ ] **Step 2: 写路由测试（用 FastAPI TestClient + mock ytdlp_runner）**

`ytdlp-service/app/tests/test_routes.py`:
```python
import os
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def env(monkeypatch, tmp_path):
    monkeypatch.setenv("INTERNAL_API_TOKEN", "test-secret-32-chars-12345678901234567890")
    monkeypatch.setenv("TEMP_DIR", str(tmp_path))


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


def auth_headers():
    return {"X-Internal-Token": "test-secret-32-chars-12345678901234567890"}


def test_health_no_auth_needed(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_extract_audio_requires_auth(client):
    r = client.post("/extract-audio", json={"url": "https://x"})
    assert r.status_code == 401


def test_extract_audio_happy_path(client, tmp_path):
    fake = {
        "title": "T",
        "duration": 60,
        "thumbnail": "http://x/t.jpg",
        "audio_path": str(tmp_path / "audio.mp3"),
    }
    with patch("app.routes.extract.extract_audio", return_value=fake):
        r = client.post(
            "/extract-audio",
            json={"url": "https://www.youtube.com/watch?v=x"},
            headers=auth_headers(),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "T"
    assert body["duration"] == 60
    assert body["audio_path"] == str(tmp_path / "audio.mp3")


def test_parse_video_returns_download_token(client, tmp_path):
    fake = {
        "title": "V",
        "duration": 120,
        "thumbnail": "http://x/t.jpg",
        "video_path": str(tmp_path / "video.mp4"),
        "ext": "mp4",
    }
    with patch("app.routes.parse.parse_video", return_value=fake):
        r = client.post(
            "/parse-video",
            json={"url": "https://x"},
            headers=auth_headers(),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["title"] == "V"
    assert body["download_token"]
    # token 解码后应当包含 video_path
    from app.core.token import verify_download_token
    payload = verify_download_token(body["download_token"])
    assert payload["path"] == str(tmp_path / "video.mp4")


def test_download_route_streams_file(client, tmp_path):
    # 准备一个真实文件
    f = tmp_path / "x.mp4"
    f.write_bytes(b"hello-mp4")
    from app.core.token import sign_download_token
    token = sign_download_token(str(f), ttl_seconds=60)
    r = client.get(f"/download/{token}")
    assert r.status_code == 200
    assert r.content == b"hello-mp4"


def test_download_404_when_token_invalid(client):
    r = client.get("/download/invalid.token")
    assert r.status_code in (401, 403)


def test_download_404_when_file_missing(client, tmp_path):
    from app.core.token import sign_download_token
    token = sign_download_token(str(tmp_path / "nonexistent.mp4"), ttl_seconds=60)
    r = client.get(f"/download/{token}")
    assert r.status_code == 404
```

- [ ] **Step 3: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
.venv/bin/python -m pytest app/tests/test_routes.py -v -m "not integration"
```

Expected: FAIL.

- [ ] **Step 4: 实现 auth middleware**

`ytdlp-service/app/core/auth.py`:
```python
import os
from fastapi import Header, HTTPException


def require_internal(x_internal_token: str | None = Header(default=None)):
    expected = os.environ.get("INTERNAL_API_TOKEN")
    if not expected or len(expected) < 16:
        raise HTTPException(status_code=500, detail="INTERNAL_API_TOKEN not configured")
    if x_internal_token != expected:
        raise HTTPException(status_code=401, detail="invalid internal token")
```

- [ ] **Step 5: 实现 extract route**

`ytdlp-service/app/routes/extract.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.auth import require_internal
from app.core.tempfile import make_session_dir
from app.core.ytdlp_runner import extract_audio, YtdlpError

router = APIRouter()


class ExtractRequest(BaseModel):
    url: str


class ExtractResponse(BaseModel):
    title: str
    duration: int
    thumbnail: str
    audio_path: str


@router.post("/extract-audio", response_model=ExtractResponse, dependencies=[Depends(require_internal)])
def extract_audio_route(body: ExtractRequest):
    out_dir = make_session_dir()
    try:
        result = extract_audio(body.url, out_dir)
    except YtdlpError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ExtractResponse(**result)
```

- [ ] **Step 6: 实现 parse route**

`ytdlp-service/app/routes/parse.py`:
```python
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.auth import require_internal
from app.core.tempfile import make_session_dir
from app.core.ytdlp_runner import parse_video, YtdlpError
from app.core.token import sign_download_token

router = APIRouter()


class ParseRequest(BaseModel):
    url: str


class ParseResponse(BaseModel):
    title: str
    duration: int
    thumbnail: str
    download_token: str
    ext: str


@router.post("/parse-video", response_model=ParseResponse, dependencies=[Depends(require_internal)])
def parse_video_route(body: ParseRequest):
    out_dir = make_session_dir()
    try:
        info = parse_video(body.url, out_dir)
    except YtdlpError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ttl = int(os.environ.get("TEMP_FILE_MAX_AGE", "7200"))
    token = sign_download_token(info["video_path"], ttl_seconds=ttl)
    return ParseResponse(
        title=info["title"],
        duration=info["duration"],
        thumbnail=info["thumbnail"],
        download_token=token,
        ext=info["ext"],
    )
```

- [ ] **Step 7: 实现 download route**

`ytdlp-service/app/routes/download.py`:
```python
import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.core.token import verify_download_token, TokenInvalid, TokenExpired

router = APIRouter()


@router.get("/download/{token}")
def download_route(token: str):
    try:
        payload = verify_download_token(token)
    except (TokenInvalid, TokenExpired) as e:
        raise HTTPException(status_code=401, detail=str(e))

    path = payload["path"]
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="file not found")

    filename = os.path.basename(path)
    return FileResponse(path, media_type="video/mp4", filename=filename)
```

- [ ] **Step 8: 更新 main.py 注册 routers**

`ytdlp-service/app/main.py`:
```python
from fastapi import FastAPI
from app.routes import extract, parse, download

app = FastAPI(title="ytdlp-service", version="0.2.0")

app.include_router(extract.router)
app.include_router(parse.router)
app.include_router(download.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ytdlp-service"}
```

- [ ] **Step 9: 跑测试**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
.venv/bin/python -m pytest app/tests/ -v -m "not integration"
```

Expected: All non-integration tests pass (4 token + 3 ytdlp_runner mock + 7 routes = 14).

- [ ] **Step 10: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add ytdlp-service/app/
git commit -m "feat(ytdlp): /extract-audio /parse-video /download routes with internal token auth"
```

---

## Task 5: ytdlp-service cleanup scheduler + 启动验证

**Files:**
- Modify: `ytdlp-service/app/main.py`

- [ ] **Step 1: 加 APScheduler 启动**

`ytdlp-service/app/main.py`:
```python
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from apscheduler.schedulers.background import BackgroundScheduler

from app.routes import extract, parse, download
from app.core.tempfile import cleanup_old_files


_scheduler: BackgroundScheduler | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _scheduler
    _scheduler = BackgroundScheduler()
    max_age = int(os.environ.get("TEMP_FILE_MAX_AGE", "7200"))
    _scheduler.add_job(
        lambda: cleanup_old_files(max_age),
        "interval",
        hours=1,
        id="cleanup_temp_files",
    )
    _scheduler.start()
    try:
        yield
    finally:
        if _scheduler:
            _scheduler.shutdown(wait=False)


app = FastAPI(title="ytdlp-service", version="0.2.0", lifespan=lifespan)

app.include_router(extract.router)
app.include_router(parse.router)
app.include_router(download.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ytdlp-service"}
```

- [ ] **Step 2: 启动服务（后台）+ smoke test**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
INTERNAL_API_TOKEN=test-secret-32-chars-12345678901234567890 \
TEMP_DIR=/tmp/ai-creative \
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl -s http://localhost:8000/health
echo ""
curl -s -X POST http://localhost:8000/extract-audio -H "Content-Type: application/json" -d '{"url":"http://x"}' | head -c 200
echo ""
curl -s -X POST http://localhost:8000/extract-audio -H "X-Internal-Token: test-secret-32-chars-12345678901234567890" -H "Content-Type: application/json" -d '{"url":"http://invalid.invalid/x"}' | head -c 200
# 关闭
pkill -f "uvicorn app.main:app" || true
```

Expected:
- `/health` → `{"ok":true,"service":"ytdlp-service"}`
- 不带 token 的 extract → `{"detail":"invalid internal token"}` (401)
- 带 token 但 URL 假 → `{"detail":"yt-dlp failed: ..."}` (400) 

- [ ] **Step 3: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add ytdlp-service/app/main.py
git commit -m "feat(ytdlp): APScheduler cleanup job + lifespan management"
```

---

## Task 6: web — Platform identifier (TDD)

**Files:**
- Create: `web/tests/unit/platform.test.ts`
- Create: `web/src/lib/core/platform.ts`

- [ ] **Step 1: 写失败测试**

`web/tests/unit/platform.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolvePlatform, type Platform } from '@/lib/core/platform';

describe('resolvePlatform', () => {
  const cases: Array<[string, Platform | null]> = [
    ['https://www.douyin.com/video/7234567890', 'douyin'],
    ['https://v.douyin.com/abc', 'douyin'],
    ['https://www.xiaohongshu.com/explore/abc', 'xiaohongshu'],
    ['https://xhslink.com/abc', 'xiaohongshu'],
    ['https://www.bilibili.com/video/BV1xx411c7mD', 'bilibili'],
    ['https://b23.tv/abc', 'bilibili'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://example.com/video', null],
    ['not a url', null],
    ['', null],
  ];

  for (const [url, expected] of cases) {
    it(`maps ${JSON.stringify(url)} → ${expected}`, () => {
      expect(resolvePlatform(url)).toBe(expected);
    });
  }
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/platform.test.ts
```

Expected: FAIL.

- [ ] **Step 3: 实现**

`web/src/lib/core/platform.ts`:
```ts
export type Platform = 'douyin' | 'xiaohongshu' | 'bilibili' | 'youtube';

const PATTERNS: Array<[Platform, RegExp]> = [
  ['douyin', /(?:^|\.)douyin\.com$/i],
  ['xiaohongshu', /(?:^|\.)xiaohongshu\.com$/i],
  ['xiaohongshu', /(?:^|\.)xhslink\.com$/i],
  ['bilibili', /(?:^|\.)bilibili\.com$/i],
  ['bilibili', /(?:^|\.)b23\.tv$/i],
  ['youtube', /(?:^|\.)youtube\.com$/i],
  ['youtube', /(?:^|\.)youtu\.be$/i],
];

export function resolvePlatform(url: string): Platform | null {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  for (const [p, re] of PATTERNS) {
    if (re.test(host)) return p;
  }
  return null;
}
```

- [ ] **Step 4: 跑测试，期望通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/platform.test.ts
```

Expected: 11 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/core/platform.ts web/tests/unit/platform.test.ts
git commit -m "feat(core): platform identifier for douyin/xhs/bilibili/youtube URLs"
```

---

## Task 7: web — Points service (TDD with prisma transaction)

**Files:**
- Create: `web/tests/integration/points.test.ts`
- Create: `web/src/lib/core/points.ts`

- [ ] **Step 1: 写失败测试**

`web/tests/integration/points.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { testPrisma, resetDb } from '../helpers/test-db';
import { consumePoints, addPoints, adminAdjustPoints, PointsInsufficientError } from '@/lib/core/points';

beforeEach(async () => {
  await resetDb();
});

async function makeUser(points: number) {
  return testPrisma.user.create({
    data: { userId: 'AC00000001', phone: '13800138000', points },
  });
}

describe('consumePoints', () => {
  it('deducts points + records transaction + creates usage record', async () => {
    const u = await makeUser(100);
    const result = await consumePoints({
      userId: u.id,
      amount: 10,
      description: '文案提取',
      usageRecord: {
        type: 'extract_text',
        videoUrl: 'https://x',
        platform: 'douyin',
      },
    });

    expect(result.balanceAfter).toBe(90);

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(90);

    const tx = await testPrisma.pointTransaction.findFirst({ where: { userId: u.id } });
    expect(tx!.amount).toBe(-10);
    expect(tx!.balanceAfter).toBe(90);
    expect(tx!.type).toBe('consume');

    const ur = await testPrisma.usageRecord.findFirst({ where: { userId: u.id } });
    expect(ur!.status).toBe('success');
    expect(ur!.pointsConsumed).toBe(10);
  });

  it('throws PointsInsufficientError when balance < amount', async () => {
    const u = await makeUser(5);
    await expect(consumePoints({
      userId: u.id,
      amount: 10,
      description: 'too much',
      usageRecord: { type: 'extract_text', videoUrl: 'https://x', platform: 'douyin' },
    })).rejects.toThrow(PointsInsufficientError);

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(5);
  });

  it('serializes concurrent deductions correctly (no overdraft)', async () => {
    const u = await makeUser(15);
    // 3 个并发各扣 10 — 只能成功 1 个
    const results = await Promise.allSettled([
      consumePoints({ userId: u.id, amount: 10, description: 'a', usageRecord: { type: 'extract_text', videoUrl: 'a', platform: 'douyin' } }),
      consumePoints({ userId: u.id, amount: 10, description: 'b', usageRecord: { type: 'extract_text', videoUrl: 'b', platform: 'douyin' } }),
      consumePoints({ userId: u.id, amount: 10, description: 'c', usageRecord: { type: 'extract_text', videoUrl: 'c', platform: 'douyin' } }),
    ]);
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    expect(succeeded).toBe(1);
    expect(failed).toBe(2);

    const refreshed = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(refreshed!.points).toBe(5);
  });
});

describe('addPoints', () => {
  it('increases balance + creates recharge transaction', async () => {
    const u = await makeUser(0);
    const result = await addPoints({
      userId: u.id,
      amount: 2000,
      description: '充值2000积分',
      relatedOrderId: 'AC2026041801',
    });
    expect(result.balanceAfter).toBe(2000);

    const tx = await testPrisma.pointTransaction.findFirst({ where: { userId: u.id } });
    expect(tx!.amount).toBe(2000);
    expect(tx!.type).toBe('recharge');
    expect(tx!.relatedOrderId).toBe('AC2026041801');
  });
});

describe('adminAdjustPoints', () => {
  it('can both add and deduct', async () => {
    const u = await makeUser(50);
    await adminAdjustPoints({ userId: u.id, amount: 100, description: 'manual top-up' });
    let r = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(r!.points).toBe(150);

    await adminAdjustPoints({ userId: u.id, amount: -30, description: 'penalty' });
    r = await testPrisma.user.findUnique({ where: { id: u.id } });
    expect(r!.points).toBe(120);

    const txns = await testPrisma.pointTransaction.findMany({ where: { userId: u.id }, orderBy: { id: 'asc' } });
    expect(txns).toHaveLength(2);
    expect(txns[0].type).toBe('admin_adjust');
    expect(txns[1].type).toBe('admin_adjust');
  });
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/points.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: 实现**

`web/src/lib/core/points.ts`:
```ts
import { prisma } from '@/lib/db/prisma';
import type { UsageType } from '@prisma/client';

export class PointsInsufficientError extends Error {
  constructor(public readonly current: number, public readonly required: number) {
    super(`积分不足，当前 ${current} / 需要 ${required}`);
    this.name = 'PointsInsufficientError';
  }
}

export interface UsageRecordInput {
  type: UsageType;
  videoUrl: string;
  platform: string;
  resultText?: string;
  resultFileUrl?: string;
  videoDuration?: number;
}

export interface ConsumeInput {
  userId: string;
  amount: number;
  description: string;
  usageRecord: UsageRecordInput;
  relatedOrderId?: string;
}

export interface ConsumeResult {
  balanceAfter: number;
}

/**
 * 原子事务：FOR UPDATE 锁用户行 → 检查余额 → 扣减 → 写流水 + 使用记录。
 */
export async function consumePoints(input: ConsumeInput): Promise<ConsumeResult> {
  return await prisma.$transaction(async (tx) => {
    // SELECT ... FOR UPDATE
    const rows = await tx.$queryRawUnsafe<Array<{ points: number }>>(
      'SELECT points FROM users WHERE id = $1::uuid FOR UPDATE',
      input.userId
    );
    if (rows.length === 0) throw new Error(`user not found: ${input.userId}`);
    const current = rows[0].points;
    if (current < input.amount) throw new PointsInsufficientError(current, input.amount);

    const balanceAfter = current - input.amount;

    await tx.user.update({
      where: { id: input.userId },
      data: { points: balanceAfter },
    });

    await tx.pointTransaction.create({
      data: {
        userId: input.userId,
        type: 'consume',
        amount: -input.amount,
        balanceAfter,
        description: input.description,
        relatedOrderId: input.relatedOrderId,
      },
    });

    await tx.usageRecord.create({
      data: {
        userId: input.userId,
        type: input.usageRecord.type,
        videoUrl: input.usageRecord.videoUrl,
        platform: input.usageRecord.platform,
        status: 'success',
        pointsConsumed: input.amount,
        resultText: input.usageRecord.resultText,
        resultFileUrl: input.usageRecord.resultFileUrl,
        videoDuration: input.usageRecord.videoDuration,
      },
    });

    return { balanceAfter };
  }, { isolationLevel: 'Serializable' });
}

export interface AddInput {
  userId: string;
  amount: number;
  description: string;
  relatedOrderId?: string;
}

export async function addPoints(input: AddInput): Promise<ConsumeResult> {
  return await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: input.userId },
      data: { points: { increment: input.amount } },
    });
    await tx.pointTransaction.create({
      data: {
        userId: input.userId,
        type: 'recharge',
        amount: input.amount,
        balanceAfter: u.points,
        description: input.description,
        relatedOrderId: input.relatedOrderId,
      },
    });
    return { balanceAfter: u.points };
  });
}

export interface AdjustInput {
  userId: string;
  amount: number;          // 正负皆可
  description: string;
}

export async function adminAdjustPoints(input: AdjustInput): Promise<ConsumeResult> {
  return await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: input.userId },
      data: { points: { increment: input.amount } },
    });
    if (u.points < 0) throw new Error('调整后余额不能为负');
    await tx.pointTransaction.create({
      data: {
        userId: input.userId,
        type: 'admin_adjust',
        amount: input.amount,
        balanceAfter: u.points,
        description: input.description,
      },
    });
    return { balanceAfter: u.points };
  });
}

/**
 * 仅记录失败的 usage_record（不扣积分）。
 */
export async function recordFailedUsage(input: {
  userId: string;
  type: UsageType;
  videoUrl: string;
  platform: string;
  errorMessage: string;
}): Promise<void> {
  await prisma.usageRecord.create({
    data: {
      userId: input.userId,
      type: input.type,
      videoUrl: input.videoUrl,
      platform: input.platform,
      status: 'failed',
      pointsConsumed: 0,
      errorMessage: input.errorMessage,
    },
  });
}
```

- [ ] **Step 4: 跑测试**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/points.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/core/points.ts web/tests/integration/points.test.ts
git commit -m "feat(core): points service with FOR UPDATE atomic consumption"
```

---

## Task 8: web — Whisper client (interface + mock + openai + local stub)

**Files:**
- Create: `web/tests/unit/whisper-mock.test.ts`
- Create: `web/src/lib/clients/whisper/interface.ts`
- Create: `web/src/lib/clients/whisper/mock.ts`
- Create: `web/src/lib/clients/whisper/openai.ts`
- Create: `web/src/lib/clients/whisper/local.ts`
- Create: `web/src/lib/clients/whisper/index.ts`

- [ ] **Step 1: 安装 openai SDK**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add openai
```

- [ ] **Step 2: 写失败测试**

`web/tests/unit/whisper-mock.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('MockWhisperClient', () => {
  it('returns canned text', async () => {
    const { MockWhisperClient } = await import('@/lib/clients/whisper/mock');
    const client = new MockWhisperClient();
    const result = await client.transcribe('/tmp/x.mp3');
    expect(result.text).toContain('mock');
    expect(result.language).toBeTruthy();
  });
});

describe('Whisper factory', () => {
  beforeEach(async () => {
    const mod = await import('@/lib/clients/whisper');
    mod._resetWhisperClient();
  });

  it('returns mock for WHISPER_MODE=mock', async () => {
    process.env.WHISPER_MODE = 'mock';
    const mod = await import('@/lib/clients/whisper');
    const c = mod.getWhisperClient();
    expect(c.constructor.name).toBe('MockWhisperClient');
  });

  it('returns openai for WHISPER_MODE=openai', async () => {
    process.env.WHISPER_MODE = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    const mod = await import('@/lib/clients/whisper');
    mod._resetWhisperClient();
    const c = mod.getWhisperClient();
    expect(c.constructor.name).toBe('OpenAIWhisperClient');
  });
});
```

- [ ] **Step 3: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/whisper-mock.test.ts
```

- [ ] **Step 4: 实现 interface + 4 个模块**

`web/src/lib/clients/whisper/interface.ts`:
```ts
export interface TranscribeResult {
  text: string;
  language: string;
}

export interface WhisperClient {
  transcribe(audioPath: string): Promise<TranscribeResult>;
}
```

`web/src/lib/clients/whisper/mock.ts`:
```ts
import type { WhisperClient, TranscribeResult } from './interface';

export class MockWhisperClient implements WhisperClient {
  async transcribe(_audioPath: string): Promise<TranscribeResult> {
    return {
      text: '这是一段 mock 转写文本。在 WHISPER_MODE=openai 或 local 时会替换为真实结果。本段文字仅用于本地开发与测试。',
      language: 'zh',
    };
  }
}
```

`web/src/lib/clients/whisper/openai.ts`:
```ts
import { createReadStream } from 'node:fs';
import OpenAI from 'openai';
import type { WhisperClient, TranscribeResult } from './interface';
import { AppError, ErrCode } from '@/lib/core/errors';

export class OpenAIWhisperClient implements WhisperClient {
  private client: OpenAI;

  constructor() {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new AppError(ErrCode.WhisperFailed, 'OPENAI_API_KEY 未配置');
    this.client = new OpenAI({ apiKey: key });
  }

  async transcribe(audioPath: string): Promise<TranscribeResult> {
    try {
      const result = await this.client.audio.transcriptions.create({
        file: createReadStream(audioPath) as any,
        model: 'whisper-1',
        response_format: 'verbose_json',
      });
      // verbose_json 含 language 字段
      return {
        text: result.text,
        language: (result as any).language ?? 'unknown',
      };
    } catch (e: any) {
      throw new AppError(ErrCode.WhisperFailed, `OpenAI Whisper 失败: ${e.message}`);
    }
  }
}
```

`web/src/lib/clients/whisper/local.ts`:
```ts
import type { WhisperClient, TranscribeResult } from './interface';
import { AppError, ErrCode } from '@/lib/core/errors';

/**
 * 本地 whisper.cpp stub。P2 暂不实现真调用，需要时再接 subprocess。
 */
export class LocalWhisperClient implements WhisperClient {
  async transcribe(_audioPath: string): Promise<TranscribeResult> {
    throw new AppError(
      ErrCode.WhisperFailed,
      '本地 whisper.cpp 未实现；请改用 WHISPER_MODE=openai 或 mock'
    );
  }
}
```

`web/src/lib/clients/whisper/index.ts`:
```ts
import type { WhisperClient } from './interface';
import { MockWhisperClient } from './mock';
import { OpenAIWhisperClient } from './openai';
import { LocalWhisperClient } from './local';

export type { WhisperClient, TranscribeResult } from './interface';

let cached: WhisperClient | undefined;

export function getWhisperClient(): WhisperClient {
  if (cached) return cached;
  const mode = process.env.WHISPER_MODE ?? 'mock';
  switch (mode) {
    case 'openai':
      cached = new OpenAIWhisperClient();
      break;
    case 'local':
      cached = new LocalWhisperClient();
      break;
    default:
      cached = new MockWhisperClient();
  }
  return cached;
}

export function _resetWhisperClient(): void {
  cached = undefined;
}
```

- [ ] **Step 5: 跑测试**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm test tests/unit/whisper-mock.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/clients/whisper/ web/tests/unit/whisper-mock.test.ts web/package.json web/pnpm-lock.yaml
git commit -m "feat(whisper): mock + openai client + local stub behind factory"
```

---

## Task 9: web — Storage client (interface + local-fs + OSS stub)

**Files:**
- Create: `web/src/lib/clients/storage/interface.ts`
- Create: `web/src/lib/clients/storage/local-fs.ts`
- Create: `web/src/lib/clients/storage/oss.ts`
- Create: `web/src/lib/clients/storage/index.ts`

- [ ] **Step 1: 实现 interface + factory**

`web/src/lib/clients/storage/interface.ts`:
```ts
export interface StoredFile {
  url: string;
  expiresAt: Date;
}

export interface StorageClient {
  /** 把文件保存到存储；返回可访问 URL + 过期时间。 */
  putTempFile(localPath: string, ttlSeconds: number): Promise<StoredFile>;
  /** 删除超过 maxAge 的临时文件，返回删除数量。 */
  cleanup(maxAgeSeconds: number): Promise<number>;
}
```

`web/src/lib/clients/storage/local-fs.ts`:
```ts
import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import type { StorageClient, StoredFile } from './interface';

/**
 * 本地文件系统：直接返回文件路径作为 URL（前端不直接访问；后端代理）。
 * P2 阶段不真的"上传"，文件已经在 ytdlp-service 写入的临时目录里。
 */
export class LocalFsStorageClient implements StorageClient {
  async putTempFile(localPath: string, ttlSeconds: number): Promise<StoredFile> {
    return {
      url: `file://${localPath}`,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async cleanup(maxAgeSeconds: number): Promise<number> {
    const dir = process.env.TEMP_DIR ?? '/tmp/ai-creative';
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return 0;
    }
    let deleted = 0;
    const now = Date.now();
    for (const name of entries) {
      const full = path.join(dir, name);
      try {
        const st = statSync(full);
        if ((now - st.mtimeMs) / 1000 > maxAgeSeconds) {
          if (st.isDirectory()) {
            await fs.rm(full, { recursive: true, force: true });
          } else {
            await fs.unlink(full);
          }
          deleted++;
        }
      } catch {}
    }
    return deleted;
  }
}
```

`web/src/lib/clients/storage/oss.ts`:
```ts
import type { StorageClient, StoredFile } from './interface';
import { AppError, ErrCode } from '@/lib/core/errors';

/**
 * OSS stub：P2 不实现真上传。需要时按 `ali-oss` SDK 接入。
 */
export class OssStorageClient implements StorageClient {
  constructor() {
    if (!process.env.OSS_ACCESS_KEY_ID || !process.env.OSS_BUCKET) {
      throw new AppError(ErrCode.InternalError, 'OSS 凭证未配置');
    }
  }

  async putTempFile(_localPath: string, _ttlSeconds: number): Promise<StoredFile> {
    throw new AppError(ErrCode.InternalError, 'OSS 客户端未实现，请改用 STORAGE=local');
  }

  async cleanup(_maxAge: number): Promise<number> {
    return 0;
  }
}
```

`web/src/lib/clients/storage/index.ts`:
```ts
import type { StorageClient } from './interface';
import { LocalFsStorageClient } from './local-fs';
import { OssStorageClient } from './oss';

export type { StorageClient, StoredFile } from './interface';

let cached: StorageClient | undefined;

export function getStorageClient(): StorageClient {
  if (cached) return cached;
  cached = process.env.STORAGE === 'oss' ? new OssStorageClient() : new LocalFsStorageClient();
  return cached;
}

export function _resetStorageClient(): void {
  cached = undefined;
}
```

- [ ] **Step 2: 验证编译通过**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build 2>&1 | tail -10
```

Expected: Compiled successfully.

- [ ] **Step 3: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/clients/storage/
git commit -m "feat(storage): local-fs client + OSS stub behind factory"
```

---

## Task 10: web — ytdlp HTTP client

**Files:**
- Create: `web/src/lib/clients/ytdlp/http-client.ts`
- Create: `web/src/lib/clients/ytdlp/index.ts`

- [ ] **Step 1: 实现**

`web/src/lib/clients/ytdlp/http-client.ts`:
```ts
import { AppError, ErrCode } from '@/lib/core/errors';

export interface ExtractAudioResult {
  title: string;
  duration: number;
  thumbnail: string;
  audio_path: string;
}

export interface ParseVideoResult {
  title: string;
  duration: number;
  thumbnail: string;
  download_token: string;
  ext: string;
}

export class YtdlpHttpClient {
  private baseUrl: string;
  private internalToken: string;

  constructor() {
    this.baseUrl = process.env.YTDLP_SERVICE_URL ?? 'http://localhost:8000';
    const token = process.env.INTERNAL_API_TOKEN;
    if (!token) throw new Error('INTERNAL_API_TOKEN must be set');
    this.internalToken = token;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': this.internalToken,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail: string;
      try {
        const j = await res.json();
        detail = j.detail ?? res.statusText;
      } catch {
        detail = await res.text();
      }
      throw new AppError(ErrCode.YtdlpFailed, `ytdlp-service ${path} 失败 (${res.status}): ${detail}`);
    }
    return await res.json() as T;
  }

  async extractAudio(url: string): Promise<ExtractAudioResult> {
    return this.post<ExtractAudioResult>('/extract-audio', { url });
  }

  async parseVideo(url: string): Promise<ParseVideoResult> {
    return this.post<ParseVideoResult>('/parse-video', { url });
  }

  /** 给浏览器用的下载 URL（不经过 web 后端代理）。 */
  buildDownloadUrl(token: string): string {
    return `${this.baseUrl}/download/${token}`;
  }
}
```

`web/src/lib/clients/ytdlp/index.ts`:
```ts
import { YtdlpHttpClient } from './http-client';

let cached: YtdlpHttpClient | undefined;

export function getYtdlpClient(): YtdlpHttpClient {
  if (cached) return cached;
  cached = new YtdlpHttpClient();
  return cached;
}

export function _resetYtdlpClient(): void {
  cached = undefined;
}

export type { ExtractAudioResult, ParseVideoResult } from './http-client';
```

- [ ] **Step 2: 验证编译**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/clients/ytdlp/
git commit -m "feat(ytdlp-client): web-side HTTP client for ytdlp-service"
```

---

## Task 11: web — generic rate-limit middleware

**Files:**
- Create: `web/src/lib/middleware/with-rate-limit.ts`

- [ ] **Step 1: 实现**

`web/src/lib/middleware/with-rate-limit.ts`:
```ts
import { rateLimit } from '@/lib/core/rate-limit';
import { err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';

/**
 * 业务接口限流：默认 10 次/分钟/用户。
 * 调用方传 userId（一般从 withAuth 注入的 user.uid）。
 */
export async function checkUserRateLimit(
  userId: string,
  endpoint: string,
  limit = 10,
  windowSeconds = 60
): Promise<Response | null> {
  const ok = await rateLimit(`user:${userId}:${endpoint}`, limit, windowSeconds);
  if (!ok) return err(ErrCode.InternalError, '请求过于频繁，请稍后再试');
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/lib/middleware/with-rate-limit.ts
git commit -m "feat(middleware): user-scoped rate limit helper"
```

---

## Task 12: web — POST /api/video/extract-text (TDD with mocks)

**Files:**
- Create: `web/src/app/api/video/extract-text/route.ts`
- Create: `web/tests/integration/video-api.test.ts`

- [ ] **Step 1: 写失败测试**

`web/tests/integration/video-api.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

// Mock ytdlp client
const mockExtract = vi.fn();
vi.mock('@/lib/clients/ytdlp', () => ({
  getYtdlpClient: () => ({ extractAudio: mockExtract, parseVideo: vi.fn(), buildDownloadUrl: (t: string) => `http://ytdlp/download/${t}` }),
  _resetYtdlpClient: () => {},
}));

import { redis } from '@/lib/redis';
import { POST as extractText } from '@/app/api/video/extract-text/route';
import { testPrisma, resetDb } from '../helpers/test-db';
import { signUserToken } from '@/lib/core/auth';

beforeEach(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-chars-1234567890ab';
  process.env.WHISPER_MODE = 'mock';
  process.env.INTERNAL_API_TOKEN = 'test-secret-32-chars-12345678901234567890';
  await (redis as any).flushall();
  await resetDb();
  mockExtract.mockReset();
});

async function makeUserAndToken(points: number) {
  const user = await testPrisma.user.create({
    data: { userId: 'AC10000001', phone: '13800138000', points },
  });
  const token = await signUserToken({ uid: user.id, userId: user.userId });
  return { user, token };
}

function makeReq(body: unknown, token: string) {
  return new Request('http://localhost/api/video/extract-text', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `auth-token=${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/video/extract-text', () => {
  it('extracts text + deducts 10 points + creates success usage record', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockExtract.mockResolvedValue({
      title: 'Test',
      duration: 60,
      thumbnail: 'http://x/t.jpg',
      audio_path: '/tmp/x.mp3',
    });

    const res = await extractText(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.text).toContain('mock');
    expect(json.data.duration).toBe(60);
    expect(json.data.points_consumed).toBe(10);
    expect(json.data.points_remaining).toBe(90);

    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(90);

    const ur = await testPrisma.usageRecord.findFirst({ where: { userId: user.id } });
    expect(ur!.status).toBe('success');
    expect(ur!.type).toBe('extract_text');
    expect(ur!.platform).toBe('youtube');
  });

  it('rejects unsupported platform', async () => {
    const { token } = await makeUserAndToken(100);
    const res = await extractText(makeReq({ video_url: 'https://example.com/vid' }, token));
    const json = await res.json();
    expect(json.code).toBe(2001);
  });

  it('rejects when points insufficient', async () => {
    const { user, token } = await makeUserAndToken(5);
    const res = await extractText(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    const json = await res.json();
    expect(json.code).toBe(2010);
    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(5);  // 不变
  });

  it('rejects video > 30min and does not deduct', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockExtract.mockResolvedValue({
      title: 'Long', duration: 2000, thumbnail: '', audio_path: '/tmp/x.mp3',
    });
    const res = await extractText(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    const json = await res.json();
    expect(json.code).toBe(2002);
    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(100);
    const ur = await testPrisma.usageRecord.findFirst({ where: { userId: user.id, status: 'failed' } });
    expect(ur).toBeTruthy();
  });

  it('rejects when ytdlp fails and does not deduct', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockExtract.mockRejectedValue(new Error('ytdlp boom'));
    const res = await extractText(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    const json = await res.json();
    expect(json.code).not.toBe(0);
    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(100);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/video/extract-text', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ video_url: 'https://x' }),
    });
    const res = await extractText(req as any);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/video-api.test.ts
```

- [ ] **Step 3: 实现**

`web/src/app/api/video/extract-text/route.ts`:
```ts
import { z } from 'zod';
import { withAuth } from '@/lib/middleware/with-auth';
import { checkUserRateLimit } from '@/lib/middleware/with-rate-limit';
import { ok, err } from '@/lib/core/http';
import { ErrCode, AppError } from '@/lib/core/errors';
import { resolvePlatform } from '@/lib/core/platform';
import { consumePoints, recordFailedUsage, PointsInsufficientError } from '@/lib/core/points';
import { getYtdlpClient } from '@/lib/clients/ytdlp';
import { getWhisperClient } from '@/lib/clients/whisper';
import { promises as fs } from 'node:fs';

const POINTS = 10;
const MAX_DURATION = 1800; // 30 min

const reqSchema = z.object({ video_url: z.string().url() });

export async function POST(req: Request) {
  return withAuth(req, async (_, user) => {
    // rate limit
    const rl = await checkUserRateLimit(user.uid, 'extract-text', 10, 60);
    if (rl) return rl;

    let body: unknown;
    try { body = await req.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, '请求参数非法');
    const { video_url } = parsed.data;

    const platform = resolvePlatform(video_url);
    if (!platform) return err(ErrCode.UnsupportedPlatform, '不支持的视频平台');

    let extractResult: Awaited<ReturnType<ReturnType<typeof getYtdlpClient>['extractAudio']>>;
    try {
      extractResult = await getYtdlpClient().extractAudio(video_url);
    } catch (e) {
      const msg = e instanceof AppError ? e.message : '视频解析失败';
      await recordFailedUsage({ userId: user.uid, type: 'extract_text', videoUrl: video_url, platform, errorMessage: msg });
      return err(ErrCode.VideoParseFailed, msg);
    }

    if (extractResult.duration > MAX_DURATION) {
      await recordFailedUsage({ userId: user.uid, type: 'extract_text', videoUrl: video_url, platform, errorMessage: `视频时长 ${extractResult.duration}s 超过 ${MAX_DURATION}s` });
      // 清理音频
      fs.unlink(extractResult.audio_path).catch(() => {});
      return err(ErrCode.VideoTooLong, `视频时长超出限制（最大 30 分钟）`);
    }

    let transcribed;
    try {
      transcribed = await getWhisperClient().transcribe(extractResult.audio_path);
    } catch (e) {
      const msg = e instanceof AppError ? e.message : 'Whisper 转写失败';
      await recordFailedUsage({ userId: user.uid, type: 'extract_text', videoUrl: video_url, platform, errorMessage: msg });
      fs.unlink(extractResult.audio_path).catch(() => {});
      return err(ErrCode.WhisperFailed, msg);
    }

    let consumeResult;
    try {
      consumeResult = await consumePoints({
        userId: user.uid,
        amount: POINTS,
        description: '文案提取',
        usageRecord: {
          type: 'extract_text',
          videoUrl: video_url,
          platform,
          resultText: transcribed.text,
          videoDuration: extractResult.duration,
        },
      });
    } catch (e) {
      if (e instanceof PointsInsufficientError) {
        return err(ErrCode.PointsInsufficient, e.message);
      }
      throw e;
    } finally {
      // 清理音频
      fs.unlink(extractResult.audio_path).catch(() => {});
    }

    const minutes = Math.floor(extractResult.duration / 60).toString().padStart(2, '0');
    const seconds = (extractResult.duration % 60).toString().padStart(2, '0');

    return ok({
      title: extractResult.title,
      platform,
      duration: extractResult.duration,
      duration_text: `${minutes}:${seconds}`,
      text: transcribed.text,
      points_consumed: POINTS,
      points_remaining: consumeResult.balanceAfter,
    }, '文案提取成功');
  });
}
```

注意：积分检查在 `consumePoints` 内部（FOR UPDATE 锁），但若 ytdlp 调用前就知道余额不足会浪费一次解析。优化：在调用 ytdlp 前先快查余额：

更新 route，在 `try { extractResult = ... }` 之前加：
```ts
// 快查余额（FOR UPDATE 仍在 consumePoints 中保证原子性）
const u = await import('@/lib/db/prisma').then(m => m.prisma.user.findUnique({ where: { id: user.uid }, select: { points: true } }));
if (!u || u.points < POINTS) return err(ErrCode.PointsInsufficient, `积分不足，当前 ${u?.points ?? 0} / 需要 ${POINTS}`);
```

放在 `const platform = ...` 之后、`extractResult = ...` 之前。

- [ ] **Step 4: 跑测试**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/video-api.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/video/extract-text/ web/tests/integration/video-api.test.ts
git commit -m "feat(api): POST /api/video/extract-text with platform/duration/whisper checks"
```

---

## Task 13: web — POST /api/video/parse (TDD)

**Files:**
- Create: `web/src/app/api/video/parse/route.ts`
- Modify: `web/tests/integration/video-api.test.ts` (append)

- [ ] **Step 1: 加测试**

Append to `web/tests/integration/video-api.test.ts`:

```ts
const mockParse = vi.fn();
vi.mocked(await import('@/lib/clients/ytdlp')).getYtdlpClient = () => ({
  extractAudio: mockExtract,
  parseVideo: mockParse,
  buildDownloadUrl: (t: string) => `http://ytdlp/download/${t}`,
}) as any;

import { POST as parseVideo } from '@/app/api/video/parse/route';

beforeEach(() => { mockParse.mockReset(); });

describe('POST /api/video/parse', () => {
  it('parses + deducts 20 points + returns download_url', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockParse.mockResolvedValue({
      title: 'V', duration: 120, thumbnail: 'http://x/t.jpg',
      download_token: 'fake-token', ext: 'mp4',
    });

    const res = await parseVideo(makeReq({ video_url: 'https://www.bilibili.com/video/BV1xx411c7mD' }, token));
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.points_consumed).toBe(20);
    expect(json.data.points_remaining).toBe(80);
    expect(json.data.download_url).toContain('fake-token');
    expect(json.data.platform).toBe('bilibili');

    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(80);
  });

  it('rejects unsupported platform', async () => {
    const { token } = await makeUserAndToken(100);
    const res = await parseVideo(makeReq({ video_url: 'https://example.com/vid' }, token));
    expect((await res.json()).code).toBe(2001);
  });

  it('does not deduct when ytdlp fails', async () => {
    const { user, token } = await makeUserAndToken(100);
    mockParse.mockRejectedValue(new Error('parse boom'));
    const res = await parseVideo(makeReq({ video_url: 'https://www.youtube.com/watch?v=x' }, token));
    expect((await res.json()).code).not.toBe(0);
    const refreshed = await testPrisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(100);
  });
});
```

(Replace the inline `vi.mocked(...)` reassignment if the linter complains; alternative: reset in beforeEach with `vi.mock(...)` and `mockExtract` + `mockParse` as module-level mocks.)

实际上为了测试更稳定，重写顶部 mock 声明（替换）：

将文件顶部改为：
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import RedisMock from 'ioredis-mock';

vi.mock('@/lib/redis', () => ({ redis: new RedisMock() }));

const mockExtract = vi.fn();
const mockParse = vi.fn();
vi.mock('@/lib/clients/ytdlp', () => ({
  getYtdlpClient: () => ({
    extractAudio: mockExtract,
    parseVideo: mockParse,
    buildDownloadUrl: (t: string) => `http://ytdlp/download/${t}`,
  }),
  _resetYtdlpClient: () => {},
}));
```

并删掉中间重新声明 mockParse 的代码块。

- [ ] **Step 2: 跑测试，期望失败**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/video-api.test.ts
```

- [ ] **Step 3: 实现**

`web/src/app/api/video/parse/route.ts`:
```ts
import { z } from 'zod';
import { withAuth } from '@/lib/middleware/with-auth';
import { checkUserRateLimit } from '@/lib/middleware/with-rate-limit';
import { ok, err } from '@/lib/core/http';
import { ErrCode, AppError } from '@/lib/core/errors';
import { resolvePlatform } from '@/lib/core/platform';
import { consumePoints, recordFailedUsage, PointsInsufficientError } from '@/lib/core/points';
import { getYtdlpClient } from '@/lib/clients/ytdlp';
import { prisma } from '@/lib/db/prisma';

const POINTS = 20;
const MAX_DURATION = 1800;

const reqSchema = z.object({ video_url: z.string().url() });

export async function POST(req: Request) {
  return withAuth(req, async (_, user) => {
    const rl = await checkUserRateLimit(user.uid, 'parse-video', 10, 60);
    if (rl) return rl;

    let body: unknown;
    try { body = await req.json(); } catch { return err(ErrCode.InternalError, 'JSON 必填'); }
    const parsed = reqSchema.safeParse(body);
    if (!parsed.success) return err(ErrCode.InternalError, '请求参数非法');
    const { video_url } = parsed.data;

    const platform = resolvePlatform(video_url);
    if (!platform) return err(ErrCode.UnsupportedPlatform, '不支持的视频平台');

    const u = await prisma.user.findUnique({ where: { id: user.uid }, select: { points: true } });
    if (!u || u.points < POINTS) return err(ErrCode.PointsInsufficient, `积分不足，当前 ${u?.points ?? 0} / 需要 ${POINTS}`);

    let parseResult;
    try {
      parseResult = await getYtdlpClient().parseVideo(video_url);
    } catch (e) {
      const msg = e instanceof AppError ? e.message : '视频解析失败';
      await recordFailedUsage({ userId: user.uid, type: 'download_video', videoUrl: video_url, platform, errorMessage: msg });
      return err(ErrCode.VideoParseFailed, msg);
    }

    if (parseResult.duration > MAX_DURATION) {
      await recordFailedUsage({ userId: user.uid, type: 'download_video', videoUrl: video_url, platform, errorMessage: `时长 ${parseResult.duration}s 超出` });
      return err(ErrCode.VideoTooLong, '视频时长超出限制');
    }

    const downloadUrl = getYtdlpClient().buildDownloadUrl(parseResult.download_token);

    let consumeResult;
    try {
      consumeResult = await consumePoints({
        userId: user.uid,
        amount: POINTS,
        description: '视频下载解析',
        usageRecord: {
          type: 'download_video',
          videoUrl: video_url,
          platform,
          resultFileUrl: downloadUrl,
          videoDuration: parseResult.duration,
        },
      });
    } catch (e) {
      if (e instanceof PointsInsufficientError) return err(ErrCode.PointsInsufficient, e.message);
      throw e;
    }

    const minutes = Math.floor(parseResult.duration / 60).toString().padStart(2, '0');
    const seconds = (parseResult.duration % 60).toString().padStart(2, '0');

    return ok({
      title: parseResult.title,
      platform,
      duration: parseResult.duration,
      duration_text: `${minutes}:${seconds}`,
      thumbnail: parseResult.thumbnail,
      download_url: downloadUrl,
      points_consumed: POINTS,
      points_remaining: consumeResult.balanceAfter,
    }, '视频解析成功');
  });
}
```

- [ ] **Step 4: 跑测试**

```bash
cd /Users/benzema/code/ai-creative-tool/web
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" \
  pnpm test tests/integration/video-api.test.ts
```

Expected: 9 tests pass (6 extract + 3 parse).

- [ ] **Step 5: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/app/api/video/parse/ web/tests/integration/video-api.test.ts
git commit -m "feat(api): POST /api/video/parse with token download_url"
```

---

## Task 14: web — Dashboard UI: TextExtractor + VideoDownloader 占位

**Files:**
- Modify: `web/src/app/(auth)/dashboard/page.tsx`
- Create: `web/src/app/(auth)/dashboard/DashboardTabs.tsx`
- Create: `web/src/components/features/TextExtractor.tsx`
- Create: `web/src/components/features/VideoDownloader.tsx`
- Create: `web/src/components/features/ResultPanel.tsx`

- [ ] **Step 1: ResultPanel (复用组件)**

`web/src/components/features/ResultPanel.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Props {
  title: string;
  platform: string;
  duration: string;
  text?: string;
  downloadUrl?: string;
}

export function ResultPanel({ title, platform, duration, text, downloadUrl }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <GlassCard className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm text-white/70">
        <div><span className="text-white/40">视频标题</span><br /><span className="text-white">{title}</span></div>
        <div><span className="text-white/40">平台</span><br /><span className="text-white">{platform}</span></div>
        <div><span className="text-white/40">时长</span><br /><span className="text-white">{duration}</span></div>
      </div>
      {text && (
        <>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/90 whitespace-pre-wrap max-h-96 overflow-auto">
            {text}
          </div>
          <Button variant="ghost" onClick={copy}>{copied ? '✅ 已复制' : '📋 复制文案'}</Button>
        </>
      )}
      {downloadUrl && (
        <a href={downloadUrl} download className="inline-block">
          <Button>📥 下载完整视频</Button>
        </a>
      )}
    </GlassCard>
  );
}
```

- [ ] **Step 2: TextExtractor**

`web/src/components/features/TextExtractor.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ResultPanel } from './ResultPanel';

interface Result {
  title: string;
  platform: string;
  duration: number;
  duration_text: string;
  text: string;
  points_remaining: number;
}

const POINTS = 10;

export function TextExtractor({ initialPoints }: { initialPoints: number }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [points, setPoints] = useState(initialPoints);

  async function submit() {
    setError(null);
    setResult(null);
    if (points < POINTS) {
      setError('积分不足，请充值');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/video/extract-text', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: url }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        return;
      }
      setResult(json.data);
      setPoints(json.data.points_remaining);
      router.refresh();  // 刷新 navbar 积分
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-4">
        <p className="text-sm text-white/70">请粘贴短视频链接</p>
        <Input
          placeholder="https://www.douyin.com/video/..."
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
        <p className="text-xs text-white/50">
          支持平台：抖音 · 小红书 · B 站 · YouTube
        </p>
        <p className="text-sm text-accent">⚡ 本次操作将消耗 <span className="font-medium">{POINTS}</span> 积分</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button fullWidth loading={loading} disabled={!url} onClick={submit}>
          ✨ 提取文案
        </Button>
      </GlassCard>
      {result && (
        <ResultPanel
          title={result.title}
          platform={result.platform}
          duration={result.duration_text}
          text={result.text}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: VideoDownloader (P2 暂时只做完整下载，VideoTrimmer 在 Task 15)**

`web/src/components/features/VideoDownloader.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ResultPanel } from './ResultPanel';
import { VideoTrimmer } from './VideoTrimmer';

interface Result {
  title: string;
  platform: string;
  duration: number;
  duration_text: string;
  thumbnail: string;
  download_url: string;
  points_remaining: number;
}

const POINTS = 20;

export function VideoDownloader({ initialPoints }: { initialPoints: number }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [points, setPoints] = useState(initialPoints);

  async function submit() {
    setError(null);
    setResult(null);
    if (points < POINTS) {
      setError('积分不足，请充值');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/video/parse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ video_url: url }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        return;
      }
      setResult(json.data);
      setPoints(json.data.points_remaining);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <GlassCard className="space-y-4">
        <p className="text-sm text-white/70">请粘贴短视频链接</p>
        <Input
          placeholder="https://..."
          value={url}
          onChange={e => setUrl(e.target.value)}
        />
        <p className="text-sm text-accent">⚡ 本次操作将消耗 <span className="font-medium">{POINTS}</span> 积分</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button fullWidth loading={loading} disabled={!url} onClick={submit}>
          🔍 解析视频
        </Button>
      </GlassCard>
      {result && (
        <VideoTrimmer
          title={result.title}
          platform={result.platform}
          durationText={result.duration_text}
          duration={result.duration}
          thumbnail={result.thumbnail}
          downloadUrl={result.download_url}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: VideoTrimmer (Task 15 实现，先放占位)**

`web/src/components/features/VideoTrimmer.tsx`:
```tsx
'use client';

import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Props {
  title: string;
  platform: string;
  durationText: string;
  duration: number;
  thumbnail: string;
  downloadUrl: string;
}

export function VideoTrimmer(props: Props) {
  // P2 占位：直接下载完整视频。Task 15 接入 ffmpeg.wasm 双滑块裁剪。
  return (
    <GlassCard className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm text-white/70">
        <div><span className="text-white/40">视频标题</span><br /><span className="text-white">{props.title}</span></div>
        <div><span className="text-white/40">平台</span><br /><span className="text-white">{props.platform}</span></div>
        <div><span className="text-white/40">时长</span><br /><span className="text-white">{props.durationText}</span></div>
      </div>
      {props.thumbnail && (
        <img src={props.thumbnail} alt={props.title} className="w-full max-w-md rounded-xl" />
      )}
      <p className="text-xs text-white/50">
        🚧 视频片段裁剪（双滑块 + ffmpeg.wasm）将在 Task 15 完成；当前可下载完整视频。
      </p>
      <a href={props.downloadUrl} download={`${props.title}.mp4`}>
        <Button>📥 下载完整视频</Button>
      </a>
    </GlassCard>
  );
}
```

- [ ] **Step 5: DashboardTabs**

`web/src/app/(auth)/dashboard/DashboardTabs.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { TextExtractor } from '@/components/features/TextExtractor';
import { VideoDownloader } from '@/components/features/VideoDownloader';

type Tab = 'extract' | 'download';

export function DashboardTabs({ initialPoints }: { initialPoints: number }) {
  const [tab, setTab] = useState<Tab>('extract');

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-xl border border-white/10 bg-white/5 p-1 w-fit">
        {(['extract', 'download'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'rounded-lg px-4 py-2 text-sm transition-colors',
              tab === t ? 'bg-white/15 text-white' : 'text-white/60 hover:text-white'
            )}
          >
            {t === 'extract' ? '📝 文案提取' : '📥 视频下载'}
          </button>
        ))}
      </div>
      {tab === 'extract' ? (
        <TextExtractor initialPoints={initialPoints} />
      ) : (
        <VideoDownloader initialPoints={initialPoints} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: 更新 dashboard page 用 DashboardTabs**

`web/src/app/(auth)/dashboard/page.tsx`:
```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyUserToken } from '@/lib/core/auth';
import { prisma } from '@/lib/db/prisma';
import { DashboardTabs } from './DashboardTabs';

export default async function DashboardPage() {
  const token = cookies().get('auth-token')?.value;
  if (!token) redirect('/login');
  const payload = await verifyUserToken(token).catch(() => null);
  if (!payload) redirect('/login');
  const user = await prisma.user.findUnique({ where: { id: payload.uid } });
  if (!user) redirect('/login');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-editorial text-3xl text-white">工作台</h1>
        <p className="mt-1 text-sm text-white/60">粘贴短视频链接 → 文案提取 / 视频下载</p>
      </div>
      <DashboardTabs initialPoints={user.points} />
    </div>
  );
}
```

- [ ] **Step 7: 验证 build**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add 'web/src/app/(auth)/dashboard/' web/src/components/features/
git commit -m "feat(ui): dashboard with TextExtractor + VideoDownloader tabs"
```

---

## Task 15: web — VideoTrimmer 真实接入 ffmpeg.wasm 裁剪

**Files:**
- Modify: `web/src/components/features/VideoTrimmer.tsx`
- Modify: `web/next.config.mjs` (确认 COEP credentialless 已在 Plan 1 配)

- [ ] **Step 1: 安装 ffmpeg.wasm**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm add @ffmpeg/ffmpeg @ffmpeg/util
```

- [ ] **Step 2: 重写 VideoTrimmer**

`web/src/components/features/VideoTrimmer.tsx`:
```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/Button';

interface Props {
  title: string;
  platform: string;
  durationText: string;
  duration: number;       // 秒
  thumbnail: string;
  downloadUrl: string;
}

const MAX_INPUT_BYTES = 200 * 1024 * 1024; // 200 MB

function fmt(t: number): string {
  const m = Math.floor(t / 60).toString().padStart(2, '0');
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function VideoTrimmer(props: Props) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(props.duration);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ffmpegRef = useRef<any>(null);

  useEffect(() => { setEnd(props.duration); }, [props.duration]);

  async function loadFFmpeg() {
    if (ffmpegRef.current) return ffmpegRef.current;
    setProgress('加载 ffmpeg.wasm...');
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  }

  async function handleDownload() {
    setError(null);
    const isFull = start === 0 && end === props.duration;

    if (isFull) {
      // 完整视频直接走原下载链接
      const a = document.createElement('a');
      a.href = props.downloadUrl;
      a.download = `${props.title}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    setBusy(true);
    try {
      setProgress('下载完整视频...');
      const resp = await fetch(props.downloadUrl);
      const blob = await resp.blob();
      if (blob.size > MAX_INPUT_BYTES) {
        setError('视频过大（>200MB），请下载完整版后本地裁剪');
        return;
      }

      const ffmpeg = await loadFFmpeg();
      setProgress('裁剪中...');
      const inputName = 'in.mp4';
      const outputName = 'out.mp4';
      await ffmpeg.writeFile(inputName, new Uint8Array(await blob.arrayBuffer()));
      await ffmpeg.exec([
        '-ss', String(start),
        '-to', String(end),
        '-i', inputName,
        '-c', 'copy',
        outputName,
      ]);
      const data = await ffmpeg.readFile(outputName);
      const outBlob = new Blob([data as Uint8Array], { type: 'video/mp4' });
      const objectUrl = URL.createObjectURL(outBlob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `${props.title}-${fmt(start)}-${fmt(end)}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
    } catch (e: any) {
      setError(`裁剪失败: ${e.message ?? e}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <GlassCard className="space-y-4">
      <div className="grid grid-cols-3 gap-3 text-sm text-white/70">
        <div><span className="text-white/40">视频标题</span><br /><span className="text-white">{props.title}</span></div>
        <div><span className="text-white/40">平台</span><br /><span className="text-white">{props.platform}</span></div>
        <div><span className="text-white/40">时长</span><br /><span className="text-white">{props.durationText}</span></div>
      </div>
      {props.thumbnail && (
        <img src={props.thumbnail} alt={props.title} className="w-full max-w-md rounded-xl" />
      )}
      <div className="space-y-3">
        <p className="text-sm text-white/70">📐 片段选择（拖动滑块）</p>
        <div className="flex gap-3 text-xs text-white/60">
          <label className="flex-1 space-y-1">
            开始：{fmt(start)}
            <input
              type="range"
              min={0}
              max={props.duration}
              value={start}
              onChange={e => setStart(Math.min(Number(e.target.value), end - 1))}
              className="w-full accent-accent"
            />
          </label>
          <label className="flex-1 space-y-1">
            结束：{fmt(end)}
            <input
              type="range"
              min={0}
              max={props.duration}
              value={end}
              onChange={e => setEnd(Math.max(Number(e.target.value), start + 1))}
              className="w-full accent-accent"
            />
          </label>
        </div>
      </div>
      {progress && <p className="text-sm text-white/60">{progress}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button onClick={handleDownload} loading={busy} disabled={busy}>
        📥 {start === 0 && end === props.duration ? '下载完整视频' : `下载片段 (${fmt(start)} ~ ${fmt(end)})`}
      </Button>
    </GlassCard>
  );
}
```

- [ ] **Step 3: 验证 build**

```bash
cd /Users/benzema/code/ai-creative-tool/web
pnpm build 2>&1 | tail -10
```

注意：ffmpeg.wasm 是异步动态导入，build 时不会真正加载 wasm。SharedArrayBuffer 仅运行时需要 (COEP/COOP 已配置)。

- [ ] **Step 4: Commit**

```bash
cd /Users/benzema/code/ai-creative-tool
git add web/src/components/features/VideoTrimmer.tsx web/package.json web/pnpm-lock.yaml
git commit -m "feat(ui): VideoTrimmer with ffmpeg.wasm browser-side trimming"
```

---

## Task 16: E2E — 文案提取 happy path

**Files:**
- Create: `web/tests/e2e/extract-text.spec.ts`

- [ ] **Step 1: 启动 ytdlp-service（dev 后台）**

```bash
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
INTERNAL_API_TOKEN=test-secret-32-chars-12345678901234567890 \
TEMP_DIR=/tmp/ai-creative \
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 &
sleep 3
curl http://localhost:8000/health
```

- [ ] **Step 2: 写 E2E test (用 mock whisper 跑)**

`web/tests/e2e/extract-text.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const WEB_LOG = '/tmp/ai-creative-web-e2e.log';

async function getMockCode(phone: string, attempts = 10): Promise<string> {
  const re = new RegExp(`\\[MOCK SMS\\] phone=${phone} code=(\\d{6})`, 'g');
  for (let i = 0; i < attempts; i++) {
    try {
      const buf = readFileSync(WEB_LOG, 'utf-8');
      const matches = [...buf.matchAll(re)];
      if (matches.length > 0) return matches[matches.length - 1][1];
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`code for ${phone} not found`);
}

test('user logs in, extracts text from a real youtube URL', async ({ page }) => {
  // 注：此测试依赖 ytdlp-service 在 :8000 运行 + WHISPER_MODE=mock
  // 即使是 mock whisper，extract-audio 仍调用真实 yt-dlp + 真实下载

  const phone = `139${Math.floor(Math.random() * 100_000_000).toString().padStart(8, '0')}`;

  // 1. 登录
  await page.goto('/login');
  await page.getByPlaceholder('请输入手机号').fill(phone);
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.waitForTimeout(800);
  const code = await getMockCode(phone);
  await page.getByPlaceholder('请输入验证码').fill(code);
  await page.getByRole('button', { name: '登录 / 注册' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // 2. 给自己充 100 积分（绕过支付，用 prisma 直接 update）
  // 由于 E2E 跑前需要积分，这里我们改用 fetch 调一个测试专用的 dev endpoint
  // 简化：直接用 SQL（需要 psql）
  await page.evaluate(async () => {
    await fetch('/api/_dev/grant-points?amount=100', { method: 'POST', credentials: 'include' });
  });
  await page.reload();

  // 3. 切到文案提取 Tab
  await page.getByRole('button', { name: /文案提取/ }).click();

  // 4. 输入 YouTube URL（短视频）
  await page.getByPlaceholder(/https/).fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  // 5. 提交（会调真实 yt-dlp）
  await page.getByRole('button', { name: /提取文案/ }).click();

  // 6. 等待结果（最长 60s — yt-dlp 下载 + mock whisper）
  await expect(page.locator('text=mock')).toBeVisible({ timeout: 60_000 });
});
```

注意：上面的 E2E 需要 `/api/_dev/grant-points` endpoint。Plan 2 不实现完整支付，但需要一个 dev-only 充值入口才能跑通 E2E。

- [ ] **Step 3: 加 dev-only 充值 endpoint**

`web/src/app/api/_dev/grant-points/route.ts`:
```ts
import { withAuth } from '@/lib/middleware/with-auth';
import { addPoints } from '@/lib/core/points';
import { ok, err } from '@/lib/core/http';
import { ErrCode } from '@/lib/core/errors';

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return err(ErrCode.AdminPermissionDenied, 'dev only');
  }
  return withAuth(req, async (request, user) => {
    const url = new URL(request.url);
    const amount = Number(url.searchParams.get('amount') ?? '100');
    const result = await addPoints({
      userId: user.uid,
      amount,
      description: 'dev grant',
    });
    return ok({ balanceAfter: result.balanceAfter });
  });
}
```

- [ ] **Step 4: 跑 E2E（提示：第一次会下载 yt-dlp 真视频，可能慢）**

```bash
cd /Users/benzema/code/ai-creative-tool/web
# 确保 web 没在跑（Playwright webServer 会重新起）
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
rm -f /tmp/ai-creative-web-e2e.log
pnpm test:e2e
```

Expected: 2 tests pass (login + extract).

如果 yt-dlp 在 CI 因网络问题失败，把测试改为只跑 mocked extract（用 Playwright 拦截 /api/video/extract-text 返回 fake response）。

- [ ] **Step 5: 关闭 ytdlp-service + commit**

```bash
pkill -f "uvicorn app.main:app" || true
cd /Users/benzema/code/ai-creative-tool
git add web/tests/e2e/extract-text.spec.ts web/src/app/api/_dev/
git commit -m "test(e2e): full extract-text flow + dev-only grant-points endpoint"
```

---

## Task 17: README + 验收

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 在 README 添加 Plan 2 进度 + Native 启动 ytdlp 步骤**

在 README.md 末尾"已完成 Plan"部分更新：
```markdown
## 已完成 Plan

- ✅ **Plan 1 (P0 + P1)**：骨架 + 认证 — 21 tasks
- ✅ **Plan 2 (P2)**：视频解析 + 文案提取 + 视频下载 + ffmpeg.wasm 裁剪
- 🟡 **Plan 3 (P3)**：积分 + 微信支付 — 待写
- 🟡 **Plan 4 (P4 + P5)**：后台管理 + 测试加固 — 待写
```

并在 Native Quick Start 部分加 ytdlp-service 启动步骤：
```markdown
# 6. （另开终端）启动 ytdlp-service
cd /Users/benzema/code/ai-creative-tool/ytdlp-service
uv sync
INTERNAL_API_TOKEN=$(grep INTERNAL_API_TOKEN ../.env | cut -d= -f2) \
TEMP_DIR=/tmp/ai-creative \
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- [ ] **Step 2: 跑全套测试做最终验收**

```bash
cd /Users/benzema/code/ai-creative-tool/web

# Unit + integration
DATABASE_URL="postgresql://ai_creative:dev_only_password@localhost:5432/ai_creative" pnpm test 2>&1 | tail -10

# Build
pnpm build 2>&1 | tail -10

# Python tests
cd ../ytdlp-service
.venv/bin/python -m pytest app/tests/ -v -m "not integration" 2>&1 | tail -10
```

Expected: 全绿。

- [ ] **Step 3: Commit + tag**

```bash
cd /Users/benzema/code/ai-creative-tool
git add README.md
git commit -m "docs: README updated for P2 milestone"
git tag -a v0.2.0-p2 -m "P2: video extraction + download + ffmpeg.wasm trim"
```

---

## 验收清单 (Plan 2 完成 = 满足以下全部)

- [ ] ytdlp-service 4 个端点 (`/health`, `/extract-audio`, `/parse-video`, `/download/:token`) 都跑通
- [ ] 单元测试：platform / whisper-mock 全绿 (≥ 14 个新增)
- [ ] 集成测试：points (5) + video-api (9) 全绿
- [ ] Python 单元 + mock 测试 (token, ytdlp_runner, routes) 全绿 (≥ 14)
- [ ] 浏览器手动跑通：登录 → dashboard → 文案提取（用 dev 充积分）→ 出文案 + 积分扣减
- [ ] 浏览器手动跑通：视频下载 → 滑块裁剪 → 触发本地下载
- [ ] `pnpm build` 通过
- [ ] git tag `v0.2.0-p2` 创建

---

## 下一步

Plan 2 完成后，写 **Plan 3 (P3)**：积分 + 微信支付（订单状态机、Native API、回调验签）+ 充值页 UI。
