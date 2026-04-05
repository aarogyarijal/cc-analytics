import { useQuery } from "@tanstack/react-query";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
  x: number; // duration_ms
  y: number; // cost_usd
  z: number; // lines_of_code for size
  fill: string; // color based on commits
};

export default function SessionScatter() {
  const { data: sessions = [] } = useQuery<SessionRow[]>({
    queryKey: ["sessions", 100],
    queryFn: () => fetch("/api/sessions?limit=100").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  // Enhance sessions with scatter plot data
  const maxLines = Math.max(...sessions.map((s) => s.lines_added + s.lines_removed), 1);
  const scatterData: EnhancedSession[] = sessions.map((s) => ({
    ...s,
    x: s.duration_ms / 1000, // Convert to seconds for readability
    y: s.cost_usd,
    z: Math.max(40, Math.min(200, ((s.lines_added + s.lines_removed) / maxLines) * 160 + 40)),
    fill: s.commits > 0 ? "#34d399" : "#38bdf8", // Green if shipped, blue if exploration
  }));

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div>
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Sessions</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-50">Cost vs. Output</h2>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-2.5">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
            <XAxis
              dataKey="x"
              name="Duration (seconds)"
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              tickFormatter={(v) => fmtDurationMs(Number(v) * 1000)}
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
                      <p>Cost: {fmtCurrency(data.cost_usd, 4)}</p>
                      <p>Duration: {fmtDurationMs(data.duration_ms)}</p>
                      <p>Lines: {fmtCompact(data.lines_added + data.lines_removed)}</p>
                      <p>Commits: {data.commits > 0 ? "Yes" : "No"}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Scatter
              name="Shipped (green) / Exploration (blue)"
              data={scatterData}
              fill="#38bdf8"
              shape="circle"
            >
              {scatterData.map((point, idx) => (
                <Scatter key={idx} dataKey="y" fill={point.fill} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 text-xs text-slate-400">
        <p>
          Dot size represents lines of code. <span className="text-emerald-300">Green</span> = sessions with commits
          (productive). <span className="text-sky-300">Blue</span> = exploration sessions.
        </p>
      </div>
    </section>
  );
}
