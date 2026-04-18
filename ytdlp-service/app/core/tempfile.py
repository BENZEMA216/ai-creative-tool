"""Temporary file management."""
import os
import time
import shutil


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
