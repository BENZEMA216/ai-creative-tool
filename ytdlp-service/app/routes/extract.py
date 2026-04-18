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
