import os
import pytest
from unittest.mock import patch
from app.core.ytdlp_runner import extract_audio, parse_video, YtdlpError


def test_extract_audio_calls_ytdlp_with_audio_format():
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
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    result = extract_audio(url, str(tmp_path))
    assert result["title"]
    assert result["duration"] > 0
    assert os.path.exists(result["audio_path"])
