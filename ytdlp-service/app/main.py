from fastapi import FastAPI
from app.routes import extract, parse, download

app = FastAPI(title="ytdlp-service", version="0.2.0")

app.include_router(extract.router)
app.include_router(parse.router)
app.include_router(download.router)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ytdlp-service"}
