import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

import db
import otlp

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("cc-analytics")
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# Set of asyncio Queues — one per connected SSE client
_subscribers: set[asyncio.Queue] = set()


def _broadcast(event_type: str, payload: dict):
    msg = json.dumps({"type": event_type, **payload})
    dead = set()
    for q in _subscribers:
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            dead.add(q)
    _subscribers.difference_update(dead)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    log.info("Database initialised at %s", db.DB_PATH)
    yield


app = FastAPI(title="Claude Code Analytics", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


# ── OTLP receivers ─────────────────────────────────────────────────────────────

@app.post("/v1/metrics")
async def receive_metrics(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {}

    for m in otlp.parse_metrics(body):
        db.insert_metric(m["name"], m["value"], m["labels"], m["ts_ms"])
        # Broadcast cost/token updates to live feed
        if m["name"] in ("claude_code.token.usage", "claude_code.cost.usage"):
            _broadcast("metric", {"name": m["name"], "value": m["value"], "labels": m["labels"]})

    return {}


@app.post("/v1/logs")
async def receive_logs(request: Request):
    try:
        body = await request.json()
    except Exception:
        return {}

    for ev in otlp.parse_logs(body):
        db.insert_event(ev["event_name"], ev["attrs"], ev["ts_ms"])
        _broadcast(ev["event_name"], {"attrs": ev["attrs"]})

    return {}


# ── REST API ───────────────────────────────────────────────────────────────────

@app.get("/api/overview")
def get_overview():
    return db.query_overview()


@app.get("/api/daily")
def get_daily(days: int = Query(default=30, ge=1, le=365)):
    return db.query_daily(days)


@app.get("/api/models")
def get_models():
    return db.query_models()


@app.get("/api/tools")
def get_tools():
    return db.query_tools()


@app.get("/api/decisions")
def get_decisions():
    return db.query_decisions()


@app.get("/api/sessions")
def get_sessions(limit: int = Query(default=50, ge=1, le=500)):
    return db.query_sessions(limit)


@app.get("/api/errors")
def get_errors(limit: int = Query(default=25, ge=1, le=100)):
    return db.query_errors(limit)


@app.get("/api/patterns")
def get_patterns():
    return db.query_dow_patterns()


@app.get("/api/hourly")
def get_hourly(hours: int = Query(default=24, ge=1, le=72)):
    return db.query_hourly(hours)


@app.get("/api/30min")
def get_30min(hours: int = Query(default=24, ge=1, le=72)):
    return db.query_30min(hours)


@app.get("/api/12hourly")
def get_12hourly(days: int = Query(default=7, ge=1, le=30)):
    return db.query_12hourly(days)


@app.get("/api/interval")
def get_interval(
    interval_hours: float = Query(default=1.0, ge=0.25, le=24),
    total_hours: int = Query(default=24, ge=1, le=720),
):
    return db.query_interval(interval_hours, total_hours)


# ── SSE live feed ──────────────────────────────────────────────────────────────

@app.get("/api/live")
async def live_feed():
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    _subscribers.add(q)

    async def generator():
        try:
            while True:
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=25)
                    data = json.loads(msg)
                    event_type = data.pop("type", "message")
                    yield f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            _subscribers.discard(q)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/")
def index():
    if FRONTEND_DIST.exists():
        return FileResponse(FRONTEND_DIST / "index.html")
    return {"status": "ok"}


@app.get("/{path:path}")
def spa_fallback(path: str):
    if path.startswith("api/") or path.startswith("v1/"):
        raise HTTPException(status_code=404, detail="not found")
    if FRONTEND_DIST.exists():
        file_path = FRONTEND_DIST / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")
    raise HTTPException(status_code=404, detail="not found")
