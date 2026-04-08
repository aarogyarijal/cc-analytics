import os
import aiosqlite
import json
import time
from pathlib import Path
from contextlib import asynccontextmanager

DB_PATH = Path(os.getenv("CC_ANALYTICS_DB_PATH", str(Path(__file__).parent / "analytics.db")))

# Module-level persistent connection (set by init_db, closed by close_db)
_conn: aiosqlite.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS metrics (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  name      TEXT NOT NULL,
  value     REAL NOT NULL,
  labels    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_metrics_ts   ON metrics(ts DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name, ts DESC);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  session_id TEXT,
  prompt_id  TEXT,
  attrs      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_events_ts      ON events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_name    ON events(event_name, ts DESC);

-- Functional indexes on json_extract fields used in WHERE/GROUP BY
CREATE INDEX IF NOT EXISTS idx_metrics_label_type
  ON metrics(name, (json_extract(labels,'$.type')), ts DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_label_model
  ON metrics((json_extract(labels,'$.model')), ts DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_label_session
  ON metrics((json_extract(labels,'$."session.id"')));
"""

# Model pricing: input and cache_read prices per million tokens
MODEL_PRICING = {
    "claude-sonnet-4-6":   {"input_per_mtok": 3.0, "cache_read_per_mtok": 0.30},
    "claude-opus-4-6":     {"input_per_mtok": 15.0, "cache_read_per_mtok": 1.50},
    "claude-haiku-4-5":    {"input_per_mtok": 0.80, "cache_read_per_mtok": 0.08},
    "claude-3-5-sonnet":   {"input_per_mtok": 3.0, "cache_read_per_mtok": 0.30},
    "claude-3-opus":       {"input_per_mtok": 15.0, "cache_read_per_mtok": 1.50},
}


async def _get_conn() -> aiosqlite.Connection:
    global _conn
    if _conn is None:
        _conn = await aiosqlite.connect(DB_PATH)
        _conn.row_factory = aiosqlite.Row
        await _conn.execute("PRAGMA journal_mode=WAL")
        await _conn.execute("PRAGMA synchronous=NORMAL")
        await _conn.execute("PRAGMA cache_size=-64000")       # 64 MB
        await _conn.execute("PRAGMA mmap_size=268435456")     # 256 MB
        await _conn.execute("PRAGMA temp_store=MEMORY")
    return _conn


@asynccontextmanager
async def conn_ctx():
    conn = await _get_conn()
    try:
        yield conn
        await conn.commit()
    except Exception:
        await conn.rollback()
        raise


async def init_db():
    conn = await _get_conn()
    await conn.executescript(SCHEMA)
    await conn.commit()


async def close_db():
    global _conn
    if _conn is not None:
        await _conn.close()
        _conn = None


async def insert_metric(name: str, value: float, labels: dict, ts_ms: int | None = None):
    ts = ts_ms if ts_ms is not None else int(time.time() * 1000)
    async with conn_ctx() as conn:
        await conn.execute(
            "INSERT INTO metrics (ts, name, value, labels) VALUES (?, ?, ?, ?)",
            (ts, name, value, json.dumps(labels)),
        )


async def insert_event(event_name: str, attrs: dict, ts_ms: int | None = None):
    ts = ts_ms if ts_ms is not None else int(time.time() * 1000)
    session_id = attrs.get("session.id")
    prompt_id = attrs.get("prompt.id")
    async with conn_ctx() as conn:
        await conn.execute(
            "INSERT INTO events (ts, event_name, session_id, prompt_id, attrs) VALUES (?, ?, ?, ?, ?)",
            (ts, event_name, session_id, prompt_id, json.dumps(attrs)),
        )


# ── Query helpers ──────────────────────────────────────────────────────────────

def _today_midnight_ms() -> int:
    import datetime
    now = datetime.datetime.now()  # local time, respects TZ env var
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(midnight.timestamp() * 1000)


def _days_ago_midnight_ms(days: int) -> int:
    return _today_midnight_ms() - max(days - 1, 0) * 86_400_000


def _empty_daily_row(date: str) -> dict:
    return {
        "date": date,
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_creation_tokens": 0,
        "cost_usd": 0,
        "sessions": 0,
        "lines_added": 0,
        "lines_removed": 0,
        "lines_of_code": 0,
        "active_time_user_s": 0,
        "active_time_cli_s": 0,
        "commits": 0,
        "pull_requests": 0,
        "api_requests": 0,
        "api_errors": 0,
        "api_avg_duration_ms": 0,
        "tool_calls": 0,
        "rolling_7d_cost_usd": 0,
    }


async def query_overview() -> dict:
    since = _today_midnight_ms()
    alltime_since = _days_ago_midnight_ms(365)
    async with conn_ctx() as conn:
        # Single consolidated metrics query (replaces 7 separate queries)
        cursor = await conn.execute(
            """
            SELECT
              SUM(CASE WHEN name='claude_code.cost.usage' THEN value END) AS cost_usd,
              SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='input' THEN value END) AS input_tokens,
              SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='output' THEN value END) AS output_tokens,
              SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheRead' THEN value END) AS cache_read_tokens,
              SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheCreation' THEN value END) AS cache_creation_tokens,
              SUM(CASE WHEN name='claude_code.active_time.total' AND json_extract(labels,'$.type')='user' THEN value END) AS active_time_user_s,
              SUM(CASE WHEN name='claude_code.active_time.total' AND json_extract(labels,'$.type')='cli' THEN value END) AS active_time_cli_s,
              SUM(CASE WHEN name='claude_code.lines_of_code.count' AND json_extract(labels,'$.type')='added' THEN value END) AS lines_added,
              SUM(CASE WHEN name='claude_code.lines_of_code.count' AND json_extract(labels,'$.type')='removed' THEN value END) AS lines_removed,
              SUM(CASE WHEN name='claude_code.commit.count' THEN value END) AS commits,
              SUM(CASE WHEN name='claude_code.pull_request.count' THEN value END) AS pull_requests
            FROM metrics WHERE ts >= ?
            """,
            (since,),
        )
        m = await cursor.fetchone()

        # Single consolidated events query (replaces 4 separate queries)
        cursor = await conn.execute(
            """
            SELECT
              COUNT(DISTINCT session_id) AS sessions_today,
              SUM(CASE WHEN event_name='api_request' THEN 1 END) AS api_requests,
              SUM(CASE WHEN event_name='api_error' THEN 1 END) AS api_errors,
              SUM(CASE WHEN event_name='tool_result' AND json_extract(attrs,'$.success')='true' THEN 1 END) AS tool_success,
              SUM(CASE WHEN event_name='tool_result' THEN 1 END) AS tool_total
            FROM events WHERE ts >= ? AND session_id IS NOT NULL
            """,
            (since,),
        )
        ev = await cursor.fetchone()

        # Alltime totals (bounded to 365 days)
        cursor = await conn.execute(
            """
            SELECT
              (SELECT COUNT(DISTINCT session_id) FROM events WHERE session_id IS NOT NULL AND ts >= ?) AS total_sessions,
              (SELECT SUM(value) FROM metrics WHERE name='claude_code.cost.usage' AND ts >= ?) AS total_cost,
              (SELECT COUNT(*) FROM events WHERE event_name='api_error' AND ts >= ?) AS total_errors
            """,
            (alltime_since, alltime_since, alltime_since),
        )
        alltime = await cursor.fetchone()

        # Cache savings by model (needs GROUP BY, kept separate)
        cursor = await conn.execute(
            """
            SELECT json_extract(labels,'$.model') AS model, SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheRead' AND ts >= ?
            GROUP BY model
            """,
            (since,),
        )
        cache_read_by_model = await cursor.fetchall()

    cost_usd = m["cost_usd"] or 0.0
    input_tokens = m["input_tokens"] or 0
    cache_read_total = m["cache_read_tokens"] or 0
    tool_total = ev["tool_total"] or 0
    tool_success_rate = (ev["tool_success"] or 0) / tool_total if tool_total > 0 else 0

    # Calculate cache savings for today
    cache_savings_usd = 0.0
    for r in cache_read_by_model:
        model = r["model"]
        cache_read_tokens = r["total"] or 0
        pricing = MODEL_PRICING.get(model, {})
        if pricing and "input_per_mtok" in pricing and "cache_read_per_mtok" in pricing:
            price_delta = pricing["input_per_mtok"] - pricing["cache_read_per_mtok"]
            cache_savings_usd += cache_read_tokens * price_delta / 1_000_000
        else:
            cache_savings_usd += cache_read_tokens * cost_usd / max(input_tokens + cache_read_total, 1) * 0.9 / 1_000_000

    lines_added = m["lines_added"] or 0
    lines_removed = m["lines_removed"] or 0
    return {
        "today": {
            "input_tokens": input_tokens,
            "output_tokens": m["output_tokens"] or 0,
            "cache_read_tokens": cache_read_total,
            "cache_creation_tokens": m["cache_creation_tokens"] or 0,
            "cost_usd": round(cost_usd, 6),
            "cache_savings_usd": round(cache_savings_usd, 6),
            "sessions": ev["sessions_today"] or 0,
            "active_time_user_s": m["active_time_user_s"] or 0,
            "active_time_cli_s": m["active_time_cli_s"] or 0,
            "lines_added": lines_added,
            "lines_removed": lines_removed,
            "lines_of_code": lines_added + lines_removed,
            "commits": m["commits"] or 0,
            "pull_requests": m["pull_requests"] or 0,
            "api_requests": ev["api_requests"] or 0,
            "api_errors": ev["api_errors"] or 0,
            "tool_success_rate": round(tool_success_rate, 4),
        },
        "alltime": {
            "sessions": alltime["total_sessions"] or 0,
            "cost_usd": round(alltime["total_cost"] or 0, 6),
            "api_errors": alltime["total_errors"] or 0,
        },
    }


async def query_daily(days: int = 30) -> list[dict]:
    since = _days_ago_midnight_ms(days)
    async with conn_ctx() as conn:
        # Consolidated metrics query (replaces 7 separate queries)
        cursor = await conn.execute(
            """
            SELECT date(ts/1000,'unixepoch','localtime') AS date,
                   SUM(CASE WHEN name='claude_code.cost.usage' THEN value END) AS cost_usd,
                   SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='input' THEN value END) AS input_tokens,
                   SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='output' THEN value END) AS output_tokens,
                   SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheRead' THEN value END) AS cache_read_tokens,
                   SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheCreation' THEN value END) AS cache_creation_tokens,
                   SUM(CASE WHEN name='claude_code.lines_of_code.count' AND json_extract(labels,'$.type')='added' THEN value END) AS lines_added,
                   SUM(CASE WHEN name='claude_code.lines_of_code.count' AND json_extract(labels,'$.type')='removed' THEN value END) AS lines_removed,
                   SUM(CASE WHEN name='claude_code.active_time.total' AND json_extract(labels,'$.type')='user' THEN value END) AS active_time_user_s,
                   SUM(CASE WHEN name='claude_code.active_time.total' AND json_extract(labels,'$.type')='cli' THEN value END) AS active_time_cli_s,
                   SUM(CASE WHEN name='claude_code.commit.count' THEN value END) AS commits,
                   SUM(CASE WHEN name='claude_code.pull_request.count' THEN value END) AS pull_requests
            FROM metrics
            WHERE ts >= ?
            GROUP BY date ORDER BY date
            """,
            (since,),
        )
        metric_rows = await cursor.fetchall()

        # Consolidated events query (replaces 3 separate queries)
        cursor = await conn.execute(
            """
            SELECT date(ts/1000,'unixepoch','localtime') AS date,
                   COUNT(DISTINCT session_id) AS sessions,
                   SUM(CASE WHEN event_name='api_request' THEN 1 END) AS api_requests,
                   AVG(CASE WHEN event_name='api_request' THEN CAST(json_extract(attrs,'$.duration_ms') AS REAL) END) AS api_avg_duration,
                   SUM(CASE WHEN event_name='api_error' THEN 1 END) AS api_errors,
                   SUM(CASE WHEN event_name='tool_result' THEN 1 END) AS tool_calls
            FROM events
            WHERE ts >= ? AND session_id IS NOT NULL
            GROUP BY date ORDER BY date
            """,
            (since,),
        )
        event_rows = await cursor.fetchall()

    by_date: dict[str, dict] = {}

    for r in metric_rows:
        d = by_date.setdefault(r["date"], _empty_daily_row(r["date"]))
        d["input_tokens"] = r["input_tokens"] or 0
        d["output_tokens"] = r["output_tokens"] or 0
        d["cache_read_tokens"] = r["cache_read_tokens"] or 0
        d["cache_creation_tokens"] = r["cache_creation_tokens"] or 0
        d["cost_usd"] = round(r["cost_usd"] or 0, 6)
        d["lines_added"] = r["lines_added"] or 0
        d["lines_removed"] = r["lines_removed"] or 0
        d["lines_of_code"] = (r["lines_added"] or 0) + (r["lines_removed"] or 0)
        d["active_time_user_s"] = r["active_time_user_s"] or 0
        d["active_time_cli_s"] = r["active_time_cli_s"] or 0
        d["commits"] = r["commits"] or 0
        d["pull_requests"] = r["pull_requests"] or 0

    for r in event_rows:
        d = by_date.setdefault(r["date"], _empty_daily_row(r["date"]))
        d["sessions"] = r["sessions"] or 0
        d["api_requests"] = r["api_requests"] or 0
        d["api_avg_duration_ms"] = round(r["api_avg_duration"] or 0, 1)
        d["api_errors"] = r["api_errors"] or 0
        d["tool_calls"] = r["tool_calls"] or 0

    # Sort and compute rolling 7-day average cost
    sorted_rows = sorted(by_date.values(), key=lambda x: x["date"])
    for i, row in enumerate(sorted_rows):
        window = sorted_rows[max(0, i - 6):i + 1]
        row["rolling_7d_cost_usd"] = round(sum(r["cost_usd"] for r in window) / len(window), 6)

    return sorted_rows


async def query_models() -> list[dict]:
    async with conn_ctx() as conn:
        cursor = await conn.execute(
            """
            SELECT json_extract(labels,'$.model') AS model,
                   json_extract(labels,'$.type') AS type,
                   SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.token.usage' AND json_extract(labels,'$.model') IS NOT NULL
            GROUP BY model, type
            """
        )
        token_rows = await cursor.fetchall()

        cursor = await conn.execute(
            """
            SELECT json_extract(labels,'$.model') AS model, SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.cost.usage' AND json_extract(labels,'$.model') IS NOT NULL
            GROUP BY model
            """
        )
        cost_rows = await cursor.fetchall()

        cursor = await conn.execute(
            """
            SELECT json_extract(attrs,'$.model') AS model,
                   COUNT(*) AS cnt,
                   AVG(CAST(json_extract(attrs,'$.duration_ms') AS REAL)) AS avg_duration
            FROM events
            WHERE event_name='api_request' AND json_extract(attrs,'$.model') IS NOT NULL
            GROUP BY model
            """
        )
        request_rows = await cursor.fetchall()

        cursor = await conn.execute(
            """
            SELECT json_extract(attrs,'$.model') AS model, COUNT(*) AS cnt
            FROM events
            WHERE event_name='api_error' AND json_extract(attrs,'$.model') IS NOT NULL
            GROUP BY model
            """
        )
        error_rows = await cursor.fetchall()

    by_model: dict[str, dict] = {}
    for r in token_rows:
        model = r["model"]
        m = by_model.setdefault(
            model,
            {
                "model": model,
                "input_tokens": 0,
                "output_tokens": 0,
                "cache_read_tokens": 0,
                "cache_creation_tokens": 0,
                "cost_usd": 0,
                "request_count": 0,
                "error_count": 0,
                "avg_duration_ms": 0,
            },
        )
        key = {"input": "input_tokens", "output": "output_tokens",
               "cacheRead": "cache_read_tokens", "cacheCreation": "cache_creation_tokens"}.get(r["type"])
        if key:
            m[key] += r["total"] or 0

    for r in cost_rows:
        if r["model"] in by_model:
            by_model[r["model"]]["cost_usd"] = round(r["total"] or 0, 6)

    for r in request_rows:
        if r["model"] in by_model:
            by_model[r["model"]]["request_count"] = r["cnt"] or 0
            by_model[r["model"]]["avg_duration_ms"] = round(r["avg_duration"] or 0, 1)

    for r in error_rows:
        if r["model"] in by_model:
            by_model[r["model"]]["error_count"] = r["cnt"] or 0

    for m in by_model.values():
        total_input = m["input_tokens"] + m["cache_read_tokens"] + m["cache_creation_tokens"]
        m["cache_hit_rate"] = round(m["cache_read_tokens"] / total_input, 4) if total_input > 0 else 0
        m["output_input_ratio"] = round(m["output_tokens"] / m["input_tokens"], 4) if m["input_tokens"] > 0 else 0
        m["cost_per_request_usd"] = round(m["cost_usd"] / m["request_count"], 6) if m["request_count"] > 0 else 0
        m["error_rate"] = round(m["error_count"] / m["request_count"], 4) if m["request_count"] > 0 else 0

        # Calculate cache savings based on model pricing
        pricing = MODEL_PRICING.get(m["model"], {})
        if pricing and "input_per_mtok" in pricing and "cache_read_per_mtok" in pricing:
            input_price = pricing["input_per_mtok"]
            cache_price = pricing["cache_read_per_mtok"]
            price_delta = input_price - cache_price
            m["cache_savings_usd"] = round(m["cache_read_tokens"] * price_delta / 1_000_000, 6)
        else:
            # Fallback: assume 90% discount on blended rate
            blended_rate = m["cost_usd"] / (m["input_tokens"] + m["cache_read_tokens"] + m["cache_creation_tokens"] + 1) * 1_000_000
            m["cache_savings_usd"] = round(m["cache_read_tokens"] * blended_rate * 0.9 / 1_000_000, 6)

    return sorted(by_model.values(), key=lambda x: x["cost_usd"], reverse=True)


async def query_tools() -> list[dict]:
    async with conn_ctx() as conn:
        cursor = await conn.execute(
            """
            SELECT json_extract(attrs,'$.tool_name') AS tool,
                   COUNT(*) AS calls,
                   SUM(CASE WHEN json_extract(attrs,'$.success')='true' THEN 1 ELSE 0 END) AS successes,
                   SUM(CASE WHEN json_extract(attrs,'$.success')='false' THEN 1 ELSE 0 END) AS failures,
                   AVG(CAST(json_extract(attrs,'$.duration_ms') AS REAL)) AS avg_duration,
                   MAX(CAST(json_extract(attrs,'$.duration_ms') AS REAL)) AS max_duration
            FROM events
            WHERE event_name='tool_result' AND json_extract(attrs,'$.tool_name') IS NOT NULL
            GROUP BY tool
            ORDER BY calls DESC
            """
        )
        rows = await cursor.fetchall()

        cursor = await conn.execute(
            """
            WITH ranked AS (
              SELECT
                json_extract(attrs,'$.tool_name') AS tool,
                CAST(json_extract(attrs,'$.duration_ms') AS REAL) AS duration_ms,
                ROW_NUMBER() OVER (
                  PARTITION BY json_extract(attrs,'$.tool_name')
                  ORDER BY CAST(json_extract(attrs,'$.duration_ms') AS REAL)
                ) AS rn,
                COUNT(*) OVER (PARTITION BY json_extract(attrs,'$.tool_name')) AS cnt
              FROM events
              WHERE event_name='tool_result' AND json_extract(attrs,'$.tool_name') IS NOT NULL
            )
            SELECT tool, MIN(duration_ms) AS p95_duration_ms
            FROM ranked
            WHERE rn >= CAST((cnt * 0.95) AS INT)
            GROUP BY tool
            """
        )
        p95_rows = await cursor.fetchall()

    p95_by_tool = {r["tool"]: r["p95_duration_ms"] for r in p95_rows}
    result = []
    for r in rows:
        calls = r["calls"] or 0
        successes = r["successes"] or 0
        result.append({
            "tool": r["tool"],
            "calls": calls,
            "failures": r["failures"] or 0,
            "success_rate": round(successes / calls, 4) if calls > 0 else 0,
            "avg_duration_ms": round(r["avg_duration"] or 0, 1),
            "max_duration_ms": round(r["max_duration"] or 0, 1),
            "p95_duration_ms": round(p95_by_tool.get(r["tool"], 0) or 0, 1),
        })
    return result


async def query_decisions() -> list[dict]:
    async with conn_ctx() as conn:
        cursor = await conn.execute(
            """
            SELECT json_extract(labels,'$.tool_name') AS tool,
                   json_extract(labels,'$.language') AS language,
                   json_extract(labels,'$.decision') AS decision,
                   SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.code_edit_tool.decision'
            GROUP BY tool, language, decision
            ORDER BY total DESC
            """
        )
        rows = await cursor.fetchall()

    return [
        {
            "tool": r["tool"],
            "language": r["language"],
            "decision": r["decision"],
            "count": int(r["total"] or 0),
        }
        for r in rows
    ]


async def query_sessions(limit: int = 50, since_hours: int = 168) -> list[dict]:
    cutoff_ms = int((time.time() - since_hours * 3600) * 1000)
    async with conn_ctx() as conn:
        cursor = await conn.execute(
            """
            WITH session_events AS (
              SELECT session_id,
                     MIN(ts) AS start_ts,
                     MAX(ts) AS end_ts,
                     COUNT(*) AS event_count,
                     SUM(CASE WHEN event_name='api_request' THEN 1 ELSE 0 END) AS api_calls,
                     SUM(CASE WHEN event_name='api_error' THEN 1 ELSE 0 END) AS api_errors,
                     SUM(CASE WHEN event_name='tool_result' THEN 1 ELSE 0 END) AS tool_calls,
                     COUNT(DISTINCT prompt_id) AS prompt_count
              FROM events
              WHERE session_id IS NOT NULL
              GROUP BY session_id
              HAVING MAX(ts) >= ?
            ),
            session_metrics AS (
              SELECT json_extract(labels,'$."session.id"') AS session_id,
                     SUM(CASE WHEN name='claude_code.cost.usage' THEN value ELSE 0 END) AS cost_usd,
                     SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='input' THEN value ELSE 0 END) AS input_tokens,
                     SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='output' THEN value ELSE 0 END) AS output_tokens,
                     SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheRead' THEN value ELSE 0 END) AS cache_read_tokens,
                     SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheCreation' THEN value ELSE 0 END) AS cache_creation_tokens,
                     SUM(CASE WHEN name='claude_code.active_time.total' AND json_extract(labels,'$.type')='user' THEN value ELSE 0 END) AS active_time_user_s,
                     SUM(CASE WHEN name='claude_code.active_time.total' AND json_extract(labels,'$.type')='cli' THEN value ELSE 0 END) AS active_time_cli_s,
                     SUM(CASE WHEN name='claude_code.lines_of_code.count' AND json_extract(labels,'$.type')='added' THEN value ELSE 0 END) AS lines_added,
                     SUM(CASE WHEN name='claude_code.lines_of_code.count' AND json_extract(labels,'$.type')='removed' THEN value ELSE 0 END) AS lines_removed,
                     SUM(CASE WHEN name='claude_code.commit.count' THEN value ELSE 0 END) AS commits,
                     SUM(CASE WHEN name='claude_code.pull_request.count' THEN value ELSE 0 END) AS pull_requests
              FROM metrics
              WHERE json_extract(labels,'$."session.id"') IS NOT NULL
              GROUP BY session_id
            )
            SELECT
              e.session_id,
              e.start_ts,
              e.end_ts,
              e.event_count,
              e.api_calls,
              e.api_errors,
              e.tool_calls,
              e.prompt_count,
              COALESCE(m.cost_usd, 0) AS cost_usd,
              COALESCE(m.input_tokens, 0) AS input_tokens,
              COALESCE(m.output_tokens, 0) AS output_tokens,
              COALESCE(m.cache_read_tokens, 0) AS cache_read_tokens,
              COALESCE(m.cache_creation_tokens, 0) AS cache_creation_tokens,
              COALESCE(m.active_time_user_s, 0) AS active_time_user_s,
              COALESCE(m.active_time_cli_s, 0) AS active_time_cli_s,
              COALESCE(m.lines_added, 0) AS lines_added,
              COALESCE(m.lines_removed, 0) AS lines_removed,
              COALESCE(m.commits, 0) AS commits,
              COALESCE(m.pull_requests, 0) AS pull_requests
            FROM session_events e
            LEFT JOIN session_metrics m USING(session_id)
            ORDER BY e.start_ts DESC
            LIMIT ?
            """,
            (cutoff_ms, limit),
        )
        rows = await cursor.fetchall()

    result = []
    for r in rows:
        duration_ms = (r["end_ts"] or 0) - (r["start_ts"] or 0)
        total_tokens = (
            (r["input_tokens"] or 0)
            + (r["output_tokens"] or 0)
            + (r["cache_read_tokens"] or 0)
            + (r["cache_creation_tokens"] or 0)
        )
        result.append({
            "session_id": r["session_id"],
            "start_ts": r["start_ts"],
            "end_ts": r["end_ts"],
            "duration_ms": duration_ms,
            "event_count": r["event_count"],
            "api_calls": r["api_calls"],
            "api_errors": r["api_errors"],
            "tool_calls": r["tool_calls"],
            "prompt_count": r["prompt_count"],
            "cost_usd": round(r["cost_usd"] or 0, 6),
            "input_tokens": r["input_tokens"] or 0,
            "output_tokens": r["output_tokens"] or 0,
            "cache_read_tokens": r["cache_read_tokens"] or 0,
            "cache_creation_tokens": r["cache_creation_tokens"] or 0,
            "total_tokens": total_tokens,
            "active_time_user_s": r["active_time_user_s"] or 0,
            "active_time_cli_s": r["active_time_cli_s"] or 0,
            "lines_added": r["lines_added"] or 0,
            "lines_removed": r["lines_removed"] or 0,
            "commits": r["commits"] or 0,
            "pull_requests": r["pull_requests"] or 0,
        })
    return result


async def query_errors(limit: int = 25) -> list[dict]:
    async with conn_ctx() as conn:
        cursor = await conn.execute(
            """
            SELECT json_extract(attrs,'$.model') AS model,
                   COALESCE(json_extract(attrs,'$.status_code'), 'undefined') AS status_code,
                   COUNT(*) AS count,
                   AVG(CAST(json_extract(attrs,'$.duration_ms') AS REAL)) AS avg_duration_ms,
                   MAX(CAST(json_extract(attrs,'$.duration_ms') AS REAL)) AS max_duration_ms,
                   MAX(ts) AS last_seen_ts,
                   MIN(ts) AS first_seen_ts,
                   MAX(CAST(json_extract(attrs,'$.attempt') AS REAL)) AS max_attempt
            FROM events
            WHERE event_name='api_error'
            GROUP BY model, status_code
            ORDER BY count DESC, last_seen_ts DESC
            LIMIT ?
            """,
            (limit,),
        )
        rows = await cursor.fetchall()

    return [
        {
            "model": r["model"],
            "status_code": r["status_code"],
            "count": r["count"],
            "avg_duration_ms": round(r["avg_duration_ms"] or 0, 1),
            "max_duration_ms": round(r["max_duration_ms"] or 0, 1),
            "first_seen_ts": r["first_seen_ts"],
            "last_seen_ts": r["last_seen_ts"],
            "max_attempt": int(r["max_attempt"] or 0),
        }
        for r in rows
    ]


async def query_environmental(days: int = 30) -> list[dict]:
    """Return per-day energy and CO₂ estimates for the last N days.

    Energy estimates are derived from token counts using published research on
    LLM inference costs (Luccioni et al., 2023 "Power Hungry Processing").
    Anthropic's actual infrastructure figures are not publicly available.
    CO₂ uses the US average grid intensity (EPA 2023: 0.386 kg CO₂/kWh).
    """
    # kWh per million tokens — by token type.
    # Derived from: Luccioni et al. (2023) "Power Hungry Processing" and
    # independent estimates for large-scale transformer inference (~70B+ params).
    # Cache reads are DRAM bandwidth, not compute; estimated ~100× cheaper than
    # a full prefill pass. These are order-of-magnitude estimates.
    ENERGY_PER_MTOK = {
        "input":         0.01,    # ~10 Wh/million tokens (prefill)
        "output":        0.03,    # ~30 Wh/million tokens (autoregressive, ~3× prefill)
        "cacheRead":     0.0001,  # ~0.1 Wh/million tokens (memory read only)
        "cacheCreation": 0.01,    # same cost as input prefill
    }
    CO2_KG_PER_KWH = 0.386   # US average (EPA 2023)

    since = _days_ago_midnight_ms(days)
    async with conn_ctx() as conn:
        cursor = await conn.execute(
            """
            SELECT date(ts/1000,'unixepoch','localtime') AS date,
                   json_extract(labels,'$.type') AS type,
                   SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.token.usage' AND ts >= ?
            GROUP BY date, type
            ORDER BY date
            """,
            (since,),
        )
        token_rows = await cursor.fetchall()

    by_date: dict[str, dict] = {}
    for r in token_rows:
        d = by_date.setdefault(r["date"], {
            "date": r["date"],
            "input_tokens": 0, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_creation_tokens": 0,
        })
        key = {
            "input": "input_tokens", "output": "output_tokens",
            "cacheRead": "cache_read_tokens", "cacheCreation": "cache_creation_tokens",
        }.get(r["type"])
        if key:
            d[key] += r["total"] or 0

    results = []
    for row in sorted(by_date.values(), key=lambda x: x["date"]):
        input_e  = row["input_tokens"]          / 1e6 * ENERGY_PER_MTOK["input"]
        output_e = row["output_tokens"]         / 1e6 * ENERGY_PER_MTOK["output"]
        cache_r  = row["cache_read_tokens"]     / 1e6 * ENERGY_PER_MTOK["cacheRead"]
        cache_c  = row["cache_creation_tokens"] / 1e6 * ENERGY_PER_MTOK["cacheCreation"]
        total_e  = input_e + output_e + cache_r + cache_c
        # Saved: difference between if cache reads were full input cost
        saved_e  = row["cache_read_tokens"] / 1e6 * (ENERGY_PER_MTOK["input"] - ENERGY_PER_MTOK["cacheRead"])
        results.append({
            "date":              row["date"],
            "energy_kwh":        round(total_e, 6),
            "co2_kg":            round(total_e * CO2_KG_PER_KWH, 6),
            "cache_saved_kwh":   round(saved_e, 6),
            "cache_saved_co2_kg": round(saved_e * CO2_KG_PER_KWH, 6),
            "input_tokens":      row["input_tokens"],
            "output_tokens":     row["output_tokens"],
            "cache_read_tokens": row["cache_read_tokens"],
        })
    return results


async def _query_bucketed(bucket_expr: str, since_ms: int, extra_params: tuple = ()) -> list[dict]:
    """Shared helper for time-bucketed queries. Runs 2 consolidated queries instead of 6.

    bucket_expr: SQL expression that produces the bucket label, aliased as 'bucket'.
    extra_params: additional bind params needed by the bucket expression (e.g. interval_secs).
    """
    async with conn_ctx() as conn:
        # Consolidated metrics query
        m_params = (*extra_params, since_ms)
        cursor = await conn.execute(
            f"""
            SELECT {bucket_expr} AS bucket,
                   SUM(CASE WHEN name='claude_code.cost.usage' THEN value END) AS cost_usd,
                   SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='input' THEN value END) AS input_tokens,
                   SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='output' THEN value END) AS output_tokens,
                   SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheRead' THEN value END) AS cache_read_tokens,
                   SUM(CASE WHEN name='claude_code.token.usage' AND json_extract(labels,'$.type')='cacheCreation' THEN value END) AS cache_creation_tokens,
                   SUM(CASE WHEN name='claude_code.lines_of_code.count' THEN value END) AS lines_of_code
            FROM metrics WHERE ts >= ?
            GROUP BY bucket ORDER BY bucket
            """,
            m_params,
        )
        metric_rows = await cursor.fetchall()

        # Consolidated events query
        e_params = (*extra_params, since_ms)
        cursor = await conn.execute(
            f"""
            SELECT {bucket_expr} AS bucket,
                   SUM(CASE WHEN event_name='api_request' THEN 1 END) AS api_requests,
                   SUM(CASE WHEN event_name='api_error' THEN 1 END) AS api_errors,
                   SUM(CASE WHEN event_name='tool_result' THEN 1 END) AS tool_calls
            FROM events WHERE ts >= ?
            GROUP BY bucket ORDER BY bucket
            """,
            e_params,
        )
        event_rows = await cursor.fetchall()

    by_bucket: dict[str, dict] = {}
    for r in metric_rows:
        by_bucket[r["bucket"]] = {
            "hour": r["bucket"],
            "input_tokens": r["input_tokens"] or 0,
            "output_tokens": r["output_tokens"] or 0,
            "cache_read_tokens": r["cache_read_tokens"] or 0,
            "cache_creation_tokens": r["cache_creation_tokens"] or 0,
            "cost_usd": round(r["cost_usd"] or 0, 6),
            "lines_of_code": r["lines_of_code"] or 0,
            "api_requests": 0, "api_errors": 0, "tool_calls": 0,
        }
    for r in event_rows:
        b = by_bucket.setdefault(r["bucket"], {
            "hour": r["bucket"], "input_tokens": 0, "output_tokens": 0,
            "cache_read_tokens": 0, "cache_creation_tokens": 0, "cost_usd": 0,
            "lines_of_code": 0, "api_requests": 0, "api_errors": 0, "tool_calls": 0,
        })
        b["api_requests"] = r["api_requests"] or 0
        b["api_errors"] = r["api_errors"] or 0
        b["tool_calls"] = r["tool_calls"] or 0

    return sorted(by_bucket.values(), key=lambda x: x["hour"])


async def query_hourly(hours: int = 24) -> list[dict]:
    """Return hourly aggregations for the last N hours."""
    since = int(time.time() * 1000) - hours * 3_600_000
    return await _query_bucketed(
        "strftime('%Y-%m-%d %H:00', datetime(ts/1000, 'unixepoch', 'localtime'))",
        since,
    )


async def query_30min(hours: int = 24) -> list[dict]:
    """Return 30-minute interval aggregations for the last N hours."""
    since = int(time.time() * 1000) - hours * 3_600_000
    return await _query_bucketed(
        "strftime('%Y-%m-%d %H:', datetime(ts/1000,'unixepoch','localtime')) || "
        "CASE WHEN cast(strftime('%M', datetime(ts/1000,'unixepoch','localtime')) as int) < 30 THEN '00' ELSE '30' END",
        since,
    )


async def query_interval(interval_hours: float, total_hours: int) -> list[dict]:
    """Return aggregations bucketed by interval_hours for the last total_hours hours."""
    since = int(time.time() * 1000) - int(total_hours * 3_600_000)
    interval_secs = int(interval_hours * 3600)
    return await _query_bucketed(
        "strftime('%Y-%m-%d %H:%M', datetime((ts/1000 / ?) * ?, 'unixepoch', 'localtime'))",
        since,
        extra_params=(interval_secs, interval_secs),
    )


async def query_12hourly(days: int = 7) -> list[dict]:
    """Return 12-hour interval aggregations for the last N days."""
    since = int(time.time() * 1000) - days * 86_400_000
    return await _query_bucketed(
        "strftime('%Y-%m-%d', datetime(ts/1000,'unixepoch','localtime')) || ' ' || "
        "CASE WHEN cast(strftime('%H', datetime(ts/1000,'unixepoch','localtime')) as int) >= 12 THEN '12:00' ELSE '00:00' END",
        since,
    )


async def query_dow_patterns() -> list[dict]:
    """Return day-of-week aggregations (0=Sun to 6=Sat) with cost and productivity metrics."""
    dow_since = _days_ago_midnight_ms(90)
    async with conn_ctx() as conn:
        cursor = await conn.execute(
            """
            SELECT strftime('%w', date(ts/1000,'unixepoch','localtime')) AS dow,
                   COUNT(DISTINCT date(ts/1000,'unixepoch','localtime')) AS day_count,
                   ROUND(SUM(CASE WHEN name='claude_code.cost.usage' THEN value ELSE 0 END) /
                         NULLIF(COUNT(DISTINCT date(ts/1000,'unixepoch','localtime')), 0), 6) AS avg_cost_usd,
                   ROUND(SUM(CASE WHEN name='claude_code.lines_of_code.count' THEN value ELSE 0 END) /
                         NULLIF(COUNT(DISTINCT date(ts/1000,'unixepoch','localtime')), 0), 0) AS avg_lines,
                   ROUND(SUM(CASE WHEN name='claude_code.commit.count' THEN value ELSE 0 END) /
                         NULLIF(COUNT(DISTINCT date(ts/1000,'unixepoch','localtime')), 0), 2) AS avg_commits,
                   ROUND(COUNT(CASE WHEN event_name='api_request' THEN 1 END) /
                         NULLIF(COUNT(DISTINCT date(ts/1000,'unixepoch','localtime')), 0), 0) AS avg_api_requests
            FROM (
              SELECT ts, name, value, NULL AS event_name FROM metrics WHERE ts >= ?
              UNION ALL
              SELECT ts, NULL, NULL, event_name FROM events WHERE ts >= ?
            )
            GROUP BY dow
            ORDER BY dow
            """,
            (dow_since, dow_since),
        )
        dow_rows = await cursor.fetchall()

    result = []
    day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    for r in dow_rows:
        dow_idx = int(r["dow"] or 0)
        result.append({
            "dow": dow_idx,
            "day_name": day_names[dow_idx],
            "day_count": int(r["day_count"] or 0),
            "avg_cost_usd": round(r["avg_cost_usd"] or 0, 6),
            "avg_lines": int(r["avg_lines"] or 0),
            "avg_commits": round(r["avg_commits"] or 0, 2),
            "avg_api_requests": int(r["avg_api_requests"] or 0),
        })
    return sorted(result, key=lambda x: x["dow"])


async def query_session_events(session_id: str, limit: int = 200) -> list[dict]:
    """Return chronological events for a single session."""
    async with conn_ctx() as conn:
        cursor = await conn.execute(
            """
            SELECT ts, event_name, attrs
            FROM events
            WHERE session_id = ?
            ORDER BY ts ASC
            LIMIT ?
            """,
            (session_id, limit),
        )
        rows = await cursor.fetchall()

    result = []
    for r in rows:
        attrs = json.loads(r["attrs"]) if r["attrs"] else {}
        result.append({
            "ts": r["ts"],
            "event_name": r["event_name"],
            "attrs": attrs,
        })
    return result
