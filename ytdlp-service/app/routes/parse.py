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
