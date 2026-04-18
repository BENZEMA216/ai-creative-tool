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
    from app.core.token import verify_download_token
    payload = verify_download_token(body["download_token"])
    assert payload["path"] == str(tmp_path / "video.mp4")


def test_download_route_streams_file(client, tmp_path):
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
