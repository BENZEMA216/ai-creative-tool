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
    token = sign_download_token("/tmp/file.mp4", ttl_seconds=-1)
    with pytest.raises(TokenExpired):
        verify_download_token(token)

def test_path_mismatch_caught():
    token1 = sign_download_token("/tmp/a.mp4", ttl_seconds=60)
    payload = verify_download_token(token1)
    assert payload["path"] == "/tmp/a.mp4"
