import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { fmtCurrency, fmtDurationMs, fmtCompact, shortId } from "../lib/format";

type SessionRow = {
  session_id: string;
  start_ts: number;
  end_ts: number;
  duration_ms: number;
  event_count: number;
  api_calls: number;
  api_errors: number;
  tool_calls: number;
  prompt_count: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  active_time_user_s: number;
  active_time_cli_s: number;
  lines_added: number;
  lines_removed: number;
  commits: number;
  pull_requests: number;
};

type EnhancedSession = SessionRow & {
  x: number;
  y: number;
  z: number;
  fill: string;
};

type Filter = "all" | "shipped" | "exploration";

export default function SessionScatter() {
  const { data: sessions = [] } = useQuery<SessionRow[]>({
    queryKey: ["sessions", 500, 168],
    queryFn: () => fetch("/api/sessions?limit=500&since_hours=168").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const [filter, setFilter] = useState<Filter>("all");

  const filtered = sessions.filter((s) => {
    if (filter === "shipped") return s.commits > 0;
    if (filter === "exploration") return s.commits === 0;
    return true;
  });

  // Sort by time ascending for chronological x-axis
  const sorted = [...filtered].sort((a, b) => a.end_ts - b.end_ts);
  const maxLines = Math.max(...sorted.map((s) => s.lines_added + s.lines_removed), 1);
  const scatterData: EnhancedSession[] = sorted.map((s, i) => ({
    ...s,
    x: i,
    y: s.cost_usd,
    z: Math.max(40, Math.min(200, ((s.lines_added + s.lines_removed) / maxLines) * 160 + 40)),
    fill: s.commits > 0 ? "#34d399" : "#38bdf8",
  }));

  const handleClick = (data: EnhancedSession) => {
    const el = document.querySelector(`[data-session-id="${data.session_id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      (el as HTMLElement).click();
    }
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "shipped", label: "Shipped" },
    { key: "exploration", label: "Explore" },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Sessions</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Cost over Time</h2>
        </div>
        <div className="flex gap-1">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                filter === key
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-2.5">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
            <XAxis
              dataKey="x"
              name="Time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v) => {
                const idx = Math.round(Number(v));
                const point = scatterData[idx];
                if (!point) return "";
                return new Date(point.end_ts).toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
              }}
            />
            <YAxis
              dataKey="y"
              name="Cost"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v) => fmtCurrency(Number(v), 2)}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(2, 6, 23, 0.95)",
                border: "1px solid rgba(148,163,184,0.18)",
                borderRadius: "12px",
                color: "#e2e8f0",
              }}
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (active && payload && payload[0]) {
                  const data = payload[0].payload as EnhancedSession;
                  return (
                    <div className="space-y-1 text-xs">
                      <p className="font-semibold">{shortId(data.session_id)}</p>
                      <p>Last event: {new Date(data.end_ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                      <p>Cost: {fmtCurrency(data.cost_usd, 4)}</p>
                      <p>Duration: {fmtDurationMs(data.duration_ms)}</p>
                      <p>Lines: {fmtCompact(data.lines_added + data.lines_removed)}</p>
                      <p>Commits: {data.commits > 0 ? "Yes" : "No"}</p>
                      <p className="text-slate-500 pt-1">Click to expand session</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter
              name="Sessions"
              data={scatterData}
              onClick={(data) => handleClick(data as unknown as EnhancedSession)}
              cursor="pointer"
            >
              {scatterData.map((point, idx) => (
                <Cell key={idx} fill={point.fill} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <p>
          Dot size = lines of code. <span className="text-emerald-300">Green</span> = shipped.{" "}
          <span className="text-sky-300">Blue</span> = exploration. Click to expand.
        </p>
        <span className="tabular-nums">{filtered.length} sessions</span>
      </div>
    </section>
  );
}
