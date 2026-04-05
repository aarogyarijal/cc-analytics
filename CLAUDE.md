# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

**cc-analytics** is a personal dashboard that collects Claude Code telemetry via OpenTelemetry (OTLP over HTTP/JSON) and visualises it in a React frontend. Claude Code emits metrics and log events to the backend, which stores them in SQLite and streams live updates to the browser.

## Commands

### Setup

```bash
make install       # create .venv, install Python deps, and npm install
make setup-shell   # append required OTel env vars to ~/.zshrc (idempotent)
source ~/.zshrc    # activate the env vars in the current shell
```

### Run

```bash
make dev           # start backend (port 8000) + frontend (Vite dev, port 5173) concurrently
make backend       # backend only
make frontend      # frontend only
```

### Frontend-only commands (run from `frontend/`)

```bash
npm run lint       # ESLint
npm run build      # tsc + vite build (output to frontend/dist/)
```

## Architecture

### Data flow

```
Claude Code (OTel SDK)
  → POST /v1/metrics   (OTLP HTTP/JSON metrics)
  → POST /v1/logs      (OTLP HTTP/JSON log records)
      ↓
  backend/main.py  (FastAPI)
      ↓ parses via otlp.py → stores in SQLite via db.py
      ↓ broadcasts to in-process subscriber set (_subscribers)
      ↓
  GET /api/live  (SSE — one asyncio.Queue per connected browser tab)
      ↓
  frontend useLiveFeed hook → LiveFeed component
```

REST endpoints (`/api/overview`, `/api/daily`, `/api/models`, `/api/tools`, `/api/decisions`, `/api/sessions`) are polled by React Query components.

### Backend (`backend/`)

- **`main.py`** — FastAPI app; OTLP receivers, REST endpoints, SSE `/api/live`. Live broadcast is pure in-process (no Redis/pubsub).
- **`otlp.py`** — stateless helpers to unwrap OTLP attribute encoding (`{"stringValue": "..."}` etc.) into plain Python dicts.
- **`db.py`** — all SQLite access. Two tables: `metrics` (name/value/labels/ts) and `events` (event_name/attrs/session_id/ts). All queries live here.
- **`analytics.db`** — SQLite file, committed to the repo (intentional — personal local data).

### Frontend (`frontend/src/`)

- **`App.tsx`** — root layout; wraps everything in a single `QueryClient`.
- **`components/`** — one file per dashboard panel (`OverviewCards`, `DailyChart`, `ModelBreakdown`, `ToolTable`, `EditDecisions`, `LiveFeed`). Each fetches its own data via React Query.
- **`hooks/useLiveFeed.ts`** — manages the `EventSource` connection to `/api/live`, reconnects on error (3 s back-off), keeps last 100 events.

### Key OTel metric/event names used in queries

| Name | Type | Purpose |
|---|---|---|
| `claude_code.token.usage` | metric | input/output/cacheRead/cacheCreation tokens, labelled by `type` and `model` |
| `claude_code.cost.usage` | metric | USD cost, labelled by `model` |
| `claude_code.active_time.total` | metric | user/cli active seconds |
| `claude_code.code_edit_tool.decision` | metric | accept/reject counts by tool+language |
| `claude_code.tool_result` | event | tool call outcomes (tool_name, success, duration_ms) |
| `claude_code.api_request` | event | LLM API calls |
| `claude_code.user_prompt` | event | user prompt events |

### Vite proxy

In dev, Vite proxies `/api/*` and `/v1/*` to `http://localhost:8000` so the frontend can call the backend without CORS issues. (Configured in `frontend/vite.config.ts`.)
