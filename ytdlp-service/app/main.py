import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from apscheduler.schedulers.background import BackgroundScheduler

from app.routes import extract, parse, download
from app.core.tempfile import cleanup_old_files


_scheduler: BackgroundScheduler | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global _scheduler
    _scheduler = BackgroundScheduler()
    max_age = int(os.environ.get("TEMP_FILE_MAX_AGE", "7200"))
    _scheduler.add_job(
        lambda: cleanup_old_files(max_age),
        "interval",
        hours=1,
        id="cleanup_temp_files",
    )
    _scheduler.start()
    try:
        yield
    finally:
        if _scheduler:
            _scheduler.shutdown(wait=False)


app = FastAPI(title="ytdlp-service", version="0.2.0", lifespan=lifespan)

app.include_router(extract.router)
app.include_router(parse.router)
app.include_router(download.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ytdlp-service"}
