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

### Run (development)

```bash
make dev           # start backend (port 6767) + frontend (Vite dev, port 5173) concurrently
make backend       # backend only (port 6767)
make frontend      # frontend only (Vite dev, port 5173)
```

### Run (production / Docker)

```bash
docker compose up --build -d   # build and start container (serves on port 6767)
docker compose down            # stop container
```

The Docker container serves both backend and static frontend from a single process on **port 6767**. The `CC_ANALYTICS_DB_PATH` is mounted to a Docker volume at `/data/analytics.db`.

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

REST endpoints are polled by React Query components. SSE `/api/live` is consumed by `useLiveFeed`.

### Backend (`backend/`)

- **`main.py`** — FastAPI app; OTLP receivers, REST endpoints, SSE `/api/live`. Live broadcast is pure in-process (no Redis/pubsub).
- **`otlp.py`** — stateless helpers to unwrap OTLP attribute encoding (`{"stringValue": "..."}` etc.) into plain Python dicts. Merges resource attrs (`session.id`, `user.id`, etc.) into each metric/event's labels.
- **`db.py`** — all SQLite access. Two tables: `metrics` (name/value/labels/ts) and `events` (event_name/attrs/session_id/ts). All queries live here. Contains `MODEL_PRICING` dict for cache savings calculations.
- **`analytics.db`** — SQLite file, gitignored (personal local data). Override path with `CC_ANALYTICS_DB_PATH` env var.

### REST API endpoints

| Endpoint | Query params | Description |
|---|---|---|
| `GET /api/overview` | — | Today's KPIs + all-time totals |
| `GET /api/daily` | `days` (1–365, default 30) | Daily aggregations with rolling 7d cost |
| `GET /api/hourly` | `hours` (1–72, default 24) | Hourly aggregations for the last N hours |
| `GET /api/30min` | `hours` (1–72, default 24) | 30-minute bucket aggregations |
| `GET /api/12hourly` | `days` (1–30, default 7) | 12-hour bucket aggregations |
| `GET /api/interval` | `interval_hours`, `total_hours` | Custom-interval aggregations |
| `GET /api/environmental` | `days` (1–365, default 30) | Daily energy (kWh) and CO₂ (kg) estimates |
| `GET /api/models` | — | Per-model token/cost/error breakdown |
| `GET /api/tools` | — | Per-tool call counts, latency, success rates |
| `GET /api/decisions` | — | Code edit accept/reject by tool+language |
| `GET /api/sessions` | `limit` (1–500, default 50) | Per-session metrics, sorted by start_ts desc |
| `GET /api/errors` | `limit` (1–100, default 25) | API errors grouped by model+status_code |
| `GET /api/patterns` | — | Day-of-week productivity averages (0=Sun…6=Sat) |
| `GET /api/live` | — | SSE stream of live metric/event updates |

### Frontend (`frontend/src/`)

- **`App.tsx`** — root layout with `DashboardProvider` context and unified toolbar; section order: OverviewCards → DailyChart+LiveFeed → InsightsRow → EnvironmentalImpact → ModelBreakdown → ToolTable+EditDecisions → ErrorPanel+SessionTable.
- **`lib/format.ts`** — formatting utilities: `fmtCompact`, `fmtCurrency`, `fmtPercent`, `fmtDurationMs`, `fmtDurationSeconds`, `shortDate`, `shortId`.
- **`lib/pricing.ts`** — `MODEL_PRICING` constants (input/cache_read prices per million tokens). Used to compute `cache_savings_usd` in OverviewCards and ModelBreakdown.
- **`lib/DashboardContext.tsx`** — shared React context for period (today/week/month) and interval state; consumed by OverviewCards and DailyChart; the unified toolbar in App.tsx drives both.
- **`hooks/useLiveFeed.ts`** — manages the `EventSource` connection to `/api/live`, reconnects on error (3 s back-off), keeps last 100 events.

**Components:**

| Component | Data source | Notes |
|---|---|---|
| `OverviewCards` | `/api/overview` + `/api/daily?days=60` + `/api/environmental?days=60` | 6 KPI cards + 5 efficiency cards (cost/commit, cost/line, cache savings, burn rate, tree-days); period from shared `DashboardContext` |
| `DailyChart` | `/api/interval` | Interval from shared `DashboardContext`; 3 sub-charts: tokens/cost, activity, efficiency |
| `EnvironmentalImpact` | `/api/environmental?days=30` | CO₂ ring gauge, energy stats, equivalence cards, sparkline, cache savings badge |
| `InsightsRow` | — | Grid wrapper for SessionScatter + DowHeatmap |
| `SessionScatter` | `/api/sessions?limit=100` | ScatterChart: cost vs duration, dot size=lines, color=shipped/exploration |
| `DowHeatmap` | `/api/patterns` | Custom 7-cell heatmap by day of week (amber=cost, emerald=lines) |
| `ModelBreakdown` | `/api/models` | Horizontal bar chart + table with throughput, cache savings, adj. cost/req |
| `ToolTable` | `/api/tools` | Sortable table + Treemap; computed: bottleneck score (p95/avg), time budget |
| `EditDecisions` | `/api/decisions` | Stacked bar chart + per-language accept rate |
| `SessionTable` | `/api/sessions?limit=40` | Sortable; toggle between standard and insights columns (depth index, burn rate, tool saturation, $/line); runaway session highlight |
| `ErrorPanel` | `/api/errors` | API error table grouped by model+status_code |
| `LiveFeed` | `/api/live` (SSE) | Real-time event stream; live-updates ToolTable via React Query invalidation |

### Key computed fields (not raw from OTel)

These are derived at query time in `db.py` or in the frontend:

| Field | Computed in | Formula |
|---|---|---|
| `rolling_7d_cost_usd` | `db.query_daily` (Python) | 7-day sliding window average of `cost_usd` |
| `cache_savings_usd` | `db.query_overview`, `db.query_models` | `cache_read_tokens × (input_price − cache_read_price) / 1M` |
| `cache_hit_rate` | `db.query_models` | `cache_read / (input + cacheRead + cacheCreation)` |
| `cost_per_request_usd` | `db.query_models` | `cost_usd / request_count` |
| `p95_duration_ms` | `db.query_tools` (SQL window) | ROW_NUMBER approximation of 95th percentile |
| `cost_per_line`, `lines_per_hour` | `DailyChart` (frontend) | Computed from daily row fields |
| `depth_index` | `SessionTable` (frontend) | `api_calls / prompt_count` |
| `tool_saturation` | `SessionTable` (frontend) | `tool_calls / api_calls` |
| `burn_rate` | `SessionTable` (frontend) | `cost_usd / (active_time_s / 3600)` |
| `bottleneck_score` | `ToolTable` (frontend) | `p95_duration_ms / avg_duration_ms` |

### Key OTel metric/event names

| Name | Type | Labels/attrs |
|---|---|---|
| `claude_code.token.usage` | metric | `type` (input/output/cacheRead/cacheCreation), `model`, `session.id` |
| `claude_code.cost.usage` | metric | `model`, `session.id` |
| `claude_code.active_time.total` | metric | `type` (user/cli), `session.id` |
| `claude_code.lines_of_code.count` | metric | `type` (added/removed), `session.id` |
| `claude_code.commit.count` | metric | `session.id` |
| `claude_code.pull_request.count` | metric | `session.id` |
| `claude_code.code_edit_tool.decision` | metric | `tool_name`, `language`, `decision` (accept/reject) |
| `api_request` | event | `model`, `duration_ms`, `session.id`, `prompt.id` |
| `api_error` | event | `model`, `status_code`, `duration_ms`, `attempt` |
| `tool_result` | event | `tool_name`, `success` (string "true"/"false"), `duration_ms` |
| `user_prompt` | event | `session.id`, `prompt.id` |

Note: `session.id` arrives as an OTel **resource attribute** and is merged into each metric's labels and event's attrs by `otlp.py`. In SQLite JSON paths, access it as `$."session.id"` (dot must be quoted).

### Vite proxy (dev only)

Vite proxies `/api/*` and `/v1/*` to `http://localhost:6767`. Configured in `frontend/vite.config.ts`. Not needed in production (Docker serves everything from one process on port 6767).
