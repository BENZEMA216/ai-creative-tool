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
