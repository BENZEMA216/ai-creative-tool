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
