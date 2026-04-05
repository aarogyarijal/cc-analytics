import os
import sqlite3
import json
import time
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(os.getenv("CC_ANALYTICS_DB_PATH", str(Path(__file__).parent / "analytics.db")))

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
"""


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


@contextmanager
def conn_ctx():
    conn = get_conn()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with conn_ctx() as conn:
        conn.executescript(SCHEMA)


def insert_metric(name: str, value: float, labels: dict, ts_ms: int | None = None):
    ts = ts_ms if ts_ms is not None else int(time.time() * 1000)
    with conn_ctx() as conn:
        conn.execute(
            "INSERT INTO metrics (ts, name, value, labels) VALUES (?, ?, ?, ?)",
            (ts, name, value, json.dumps(labels)),
        )


def insert_event(event_name: str, attrs: dict, ts_ms: int | None = None):
    ts = ts_ms if ts_ms is not None else int(time.time() * 1000)
    session_id = attrs.get("session.id")
    prompt_id = attrs.get("prompt.id")
    with conn_ctx() as conn:
        conn.execute(
            "INSERT INTO events (ts, event_name, session_id, prompt_id, attrs) VALUES (?, ?, ?, ?, ?)",
            (ts, event_name, session_id, prompt_id, json.dumps(attrs)),
        )


# ── Query helpers ──────────────────────────────────────────────────────────────

def _today_midnight_ms() -> int:
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
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
    }


def query_overview() -> dict:
    since = _today_midnight_ms()
    with conn_ctx() as conn:
        token_rows = conn.execute(
            """
            SELECT json_extract(labels,'$.type') AS type,
                   SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.token.usage' AND ts >= ?
            GROUP BY type
            """,
            (since,),
        ).fetchall()
        tokens: dict[str, float] = {}
        for r in token_rows:
            tokens[r["type"] or "unknown"] = (tokens.get(r["type"] or "unknown", 0) + (r["total"] or 0))

        cost_usd = conn.execute(
            "SELECT SUM(value) AS total FROM metrics WHERE name='claude_code.cost.usage' AND ts >= ?",
            (since,),
        ).fetchone()["total"] or 0.0

        sessions_today = conn.execute(
            "SELECT COUNT(DISTINCT session_id) AS cnt FROM events WHERE ts >= ? AND session_id IS NOT NULL",
            (since,),
        ).fetchone()["cnt"] or 0

        active_rows = conn.execute(
            """
            SELECT json_extract(labels,'$.type') AS type, SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.active_time.total' AND ts >= ?
            GROUP BY type
            """,
            (since,),
        ).fetchall()
        active_time = {r["type"] or "unknown": r["total"] or 0 for r in active_rows}

        line_rows = conn.execute(
            """
            SELECT json_extract(labels,'$.type') AS type, SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.lines_of_code.count' AND ts >= ?
            GROUP BY type
            """,
            (since,),
        ).fetchall()
        lines = {r["type"] or "unknown": r["total"] or 0 for r in line_rows}

        commits_today = conn.execute(
            "SELECT SUM(value) AS total FROM metrics WHERE name='claude_code.commit.count' AND ts >= ?",
            (since,),
        ).fetchone()["total"] or 0

        prs_today = conn.execute(
            "SELECT SUM(value) AS total FROM metrics WHERE name='claude_code.pull_request.count' AND ts >= ?",
            (since,),
        ).fetchone()["total"] or 0

        api_requests_today = conn.execute(
            "SELECT COUNT(*) AS cnt FROM events WHERE event_name='api_request' AND ts >= ?",
            (since,),
        ).fetchone()["cnt"] or 0

        api_errors_today = conn.execute(
            "SELECT COUNT(*) AS cnt FROM events WHERE event_name='api_error' AND ts >= ?",
            (since,),
        ).fetchone()["cnt"] or 0

        tool_result_counts = conn.execute(
            """
            SELECT
              SUM(CASE WHEN json_extract(attrs,'$.success')='true' THEN 1 ELSE 0 END) AS success_count,
              COUNT(*) AS total_count
            FROM events
            WHERE event_name='tool_result' AND ts >= ?
            """,
            (since,),
        ).fetchone()

        total_sessions = conn.execute(
            "SELECT COUNT(DISTINCT session_id) AS cnt FROM events WHERE session_id IS NOT NULL"
        ).fetchone()["cnt"] or 0

        total_cost = conn.execute(
            "SELECT SUM(value) AS total FROM metrics WHERE name='claude_code.cost.usage'"
        ).fetchone()["total"] or 0.0

        total_errors = conn.execute(
            "SELECT COUNT(*) AS cnt FROM events WHERE event_name='api_error'"
        ).fetchone()["cnt"] or 0

    tool_result_total = tool_result_counts["total_count"] or 0
    tool_success_rate = (
        (tool_result_counts["success_count"] or 0) / tool_result_total if tool_result_total > 0 else 0
    )

    return {
        "today": {
            "input_tokens": tokens.get("input", 0),
            "output_tokens": tokens.get("output", 0),
            "cache_read_tokens": tokens.get("cacheRead", 0),
            "cache_creation_tokens": tokens.get("cacheCreation", 0),
            "cost_usd": round(cost_usd, 6),
            "sessions": sessions_today,
            "active_time_user_s": active_time.get("user", 0),
            "active_time_cli_s": active_time.get("cli", 0),
            "lines_added": lines.get("added", 0),
            "lines_removed": lines.get("removed", 0),
            "lines_of_code": (lines.get("added", 0) + lines.get("removed", 0)),
            "commits": commits_today,
            "pull_requests": prs_today,
            "api_requests": api_requests_today,
            "api_errors": api_errors_today,
            "tool_success_rate": round(tool_success_rate, 4),
        },
        "alltime": {
            "sessions": total_sessions,
            "cost_usd": round(total_cost, 6),
            "api_errors": total_errors,
        },
    }


def query_daily(days: int = 30) -> list[dict]:
    since = _days_ago_midnight_ms(days)
    with conn_ctx() as conn:
        token_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date,
                   json_extract(labels,'$.type') AS type,
                   SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.token.usage' AND ts >= ?
            GROUP BY date, type
            ORDER BY date
            """,
            (since,),
        ).fetchall()

        cost_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date, SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.cost.usage' AND ts >= ?
            GROUP BY date ORDER BY date
            """,
            (since,),
        ).fetchall()

        session_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date,
                   COUNT(DISTINCT session_id) AS cnt
            FROM events
            WHERE ts >= ? AND session_id IS NOT NULL
            GROUP BY date ORDER BY date
            """,
            (since,),
        ).fetchall()

        line_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date,
                   json_extract(labels,'$.type') AS type,
                   SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.lines_of_code.count' AND ts >= ?
            GROUP BY date, type
            ORDER BY date
            """,
            (since,),
        ).fetchall()

        active_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date,
                   json_extract(labels,'$.type') AS type,
                   SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.active_time.total' AND ts >= ?
            GROUP BY date, type
            ORDER BY date
            """,
            (since,),
        ).fetchall()

        commit_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date, SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.commit.count' AND ts >= ?
            GROUP BY date ORDER BY date
            """,
            (since,),
        ).fetchall()

        pr_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date, SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.pull_request.count' AND ts >= ?
            GROUP BY date ORDER BY date
            """,
            (since,),
        ).fetchall()

        api_request_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date,
                   COUNT(*) AS cnt,
                   AVG(CAST(json_extract(attrs,'$.duration_ms') AS REAL)) AS avg_duration
            FROM events
            WHERE event_name='api_request' AND ts >= ?
            GROUP BY date ORDER BY date
            """,
            (since,),
        ).fetchall()

        api_error_rows = conn.execute(
            """
            SELECT date(ts/1000,'unixepoch') AS date, COUNT(*) AS cnt
            FROM events
            WHERE event_name='api_error' AND ts >= ?
            GROUP BY date ORDER BY date
            """,
            (since,),
        ).fetchall()

    by_date: dict[str, dict] = {}

    for r in token_rows:
        d = by_date.setdefault(r["date"], _empty_daily_row(r["date"]))
        key = {"input": "input_tokens", "output": "output_tokens",
               "cacheRead": "cache_read_tokens", "cacheCreation": "cache_creation_tokens"}.get(r["type"])
        if key:
            d[key] += r["total"] or 0

    for r in cost_rows:
        by_date.setdefault(r["date"], _empty_daily_row(r["date"]))["cost_usd"] = round(r["total"] or 0, 6)

    for r in session_rows:
        by_date.setdefault(r["date"], _empty_daily_row(r["date"]))["sessions"] = r["cnt"] or 0

    for r in line_rows:
        d = by_date.setdefault(r["date"], _empty_daily_row(r["date"]))
        key = {"added": "lines_added", "removed": "lines_removed"}.get(r["type"])
        if key:
            d[key] += r["total"] or 0
            d["lines_of_code"] += r["total"] or 0

    for r in active_rows:
        d = by_date.setdefault(r["date"], _empty_daily_row(r["date"]))
        key = {"user": "active_time_user_s", "cli": "active_time_cli_s"}.get(r["type"])
        if key:
            d[key] += r["total"] or 0

    for r in commit_rows:
        by_date.setdefault(r["date"], _empty_daily_row(r["date"]))["commits"] = r["total"] or 0

    for r in pr_rows:
        by_date.setdefault(r["date"], _empty_daily_row(r["date"]))["pull_requests"] = r["total"] or 0

    for r in api_request_rows:
        d = by_date.setdefault(r["date"], _empty_daily_row(r["date"]))
        d["api_requests"] = r["cnt"] or 0
        d["api_avg_duration_ms"] = round(r["avg_duration"] or 0, 1)

    for r in api_error_rows:
        by_date.setdefault(r["date"], _empty_daily_row(r["date"]))["api_errors"] = r["cnt"] or 0

    return sorted(by_date.values(), key=lambda x: x["date"])


def query_models() -> list[dict]:
    with conn_ctx() as conn:
        token_rows = conn.execute(
            """
            SELECT json_extract(labels,'$.model') AS model,
                   json_extract(labels,'$.type') AS type,
                   SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.token.usage' AND json_extract(labels,'$.model') IS NOT NULL
            GROUP BY model, type
            """
        ).fetchall()

        cost_rows = conn.execute(
            """
            SELECT json_extract(labels,'$.model') AS model, SUM(value) AS total
            FROM metrics
            WHERE name='claude_code.cost.usage' AND json_extract(labels,'$.model') IS NOT NULL
            GROUP BY model
            """
        ).fetchall()

        request_rows = conn.execute(
            """
            SELECT json_extract(attrs,'$.model') AS model,
                   COUNT(*) AS cnt,
                   AVG(CAST(json_extract(attrs,'$.duration_ms') AS REAL)) AS avg_duration
            FROM events
            WHERE event_name='api_request' AND json_extract(attrs,'$.model') IS NOT NULL
            GROUP BY model
            """
        ).fetchall()

        error_rows = conn.execute(
            """
            SELECT json_extract(attrs,'$.model') AS model, COUNT(*) AS cnt
            FROM events
            WHERE event_name='api_error' AND json_extract(attrs,'$.model') IS NOT NULL
            GROUP BY model
            """
        ).fetchall()

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

    return sorted(by_model.values(), key=lambda x: x["cost_usd"], reverse=True)


def query_tools() -> list[dict]:
    with conn_ctx() as conn:
        rows = conn.execute(
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
        ).fetchall()

        p95_rows = conn.execute(
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
        ).fetchall()

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


def query_decisions() -> list[dict]:
    with conn_ctx() as conn:
        rows = conn.execute(
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
        ).fetchall()

    return [
        {
            "tool": r["tool"],
            "language": r["language"],
            "decision": r["decision"],
            "count": int(r["total"] or 0),
        }
        for r in rows
    ]


def query_sessions(limit: int = 50) -> list[dict]:
    with conn_ctx() as conn:
        rows = conn.execute(
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
            ),
            session_metrics AS (
              SELECT json_extract(labels,'$.session.id') AS session_id,
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
              WHERE json_extract(labels,'$.session.id') IS NOT NULL
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
            (limit,),
        ).fetchall()

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


def query_errors(limit: int = 25) -> list[dict]:
    with conn_ctx() as conn:
        rows = conn.execute(
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
        ).fetchall()

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
