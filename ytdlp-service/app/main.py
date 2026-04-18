from fastapi import FastAPI

app = FastAPI(title="ytdlp-service", version="0.1.0")


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "ytdlp-service"}
