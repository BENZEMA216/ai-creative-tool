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
