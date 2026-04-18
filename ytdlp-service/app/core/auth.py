import os
from fastapi import Header, HTTPException


def require_internal(x_internal_token: str | None = Header(default=None)):
    expected = os.environ.get("INTERNAL_API_TOKEN")
    if not expected or len(expected) < 16:
        raise HTTPException(status_code=500, detail="INTERNAL_API_TOKEN not configured")
    if x_internal_token != expected:
        raise HTTPException(status_code=401, detail="invalid internal token")
