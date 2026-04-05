import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import { fmtCompact, fmtCurrency, fmtDurationSeconds, fmtPercent, shortDate } from "../lib/format";

type DayRow = {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
  sessions: number;
  lines_added: number;
  lines_removed: number;
  lines_of_code: number;
  active_time_user_s: number;
  active_time_cli_s: number;
  commits: number;
  pull_requests: number;
  api_requests: number;
  api_errors: number;
  api_avg_duration_ms: number;
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

export default function DailyChart({ days = 30 }: { days?: number }) {
  const { data = [] } = useQuery<DayRow[]>({
    queryKey: ["daily", days],
    queryFn: () => fetch(`/api/daily?days=${days}`).then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const totals = data.reduce(
    (acc, row) => {
      acc.cost += row.cost_usd;
      acc.sessions += row.sessions;
      acc.tokens += row.input_tokens + row.output_tokens;
      acc.active += row.active_time_user_s + row.active_time_cli_s;
      acc.errors += row.api_errors;
      acc.lines += row.lines_of_code;
      acc.commits += row.commits;
      acc.prs += row.pull_requests;
      return acc;
    },
    { cost: 0, sessions: 0, tokens: 0, active: 0, errors: 0, lines: 0, commits: 0, prs: 0 },
  );

  const latest = data.at(-1);
  const cacheShare = latest
    ? latest.input_tokens + latest.cache_read_tokens + latest.cache_creation_tokens > 0
      ? latest.cache_read_tokens / (latest.input_tokens + latest.cache_read_tokens + latest.cache_creation_tokens)
      : 0
    : 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-slate-950/85 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Trend layer</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-50">Usage, cost, and productivity over time</h2>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <StatChip label="30d cost" value={fmtCurrency(totals.cost, 2)} />
          <StatChip label="30d tokens" value={fmtCompact(totals.tokens)} />
          <StatChip label="30d sessions" value={fmtCompact(totals.sessions)} />
          <StatChip label="Cache share" value={fmtPercent(cacheShare)} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Tokens and cost</h3>
              <p className="text-xs text-slate-400">Token composition plus cost pressure</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis yAxisId="tokens" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(Number(v))} />
              <YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCurrency(Number(v), 2)} />
              <Tooltip
                contentStyle={{
                  background: "rgba(2, 6, 23, 0.95)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: "12px",
                  color: "#e2e8f0",
                }}
                labelFormatter={(label) => `Date ${label}`}
                formatter={(value, name) => {
                  const v = Number(value ?? 0);
                  if (name === "cost_usd") return [fmtCurrency(v, 4), "Cost"];
                  return [fmtCompact(v), String(name).replaceAll("_", " ")];
                }}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1" }} />
              <Bar yAxisId="tokens" dataKey="input_tokens" stackId="tokens" fill="#38bdf8" name="Input tokens" />
              <Bar yAxisId="tokens" dataKey="output_tokens" stackId="tokens" fill="#8b5cf6" name="Output tokens" />
              <Bar yAxisId="tokens" dataKey="cache_read_tokens" stackId="tokens" fill="#22c55e" name="Cache read" />
              <Line yAxisId="cost" dataKey="cost_usd" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Cost" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Activity and output</h3>
              <p className="text-xs text-slate-400">Sessions, coding output, and error pressure</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(Number(v))} />
              <Tooltip
                contentStyle={{
                  background: "rgba(2, 6, 23, 0.95)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: "12px",
                  color: "#e2e8f0",
                }}
                formatter={(value, name) => [fmtCompact(Number(value ?? 0)), String(name).replaceAll("_", " ")]}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1" }} />
              <Area type="monotone" dataKey="sessions" stroke="#34d399" fill="rgba(52, 211, 153, 0.22)" name="Sessions" />
              <Area type="monotone" dataKey="lines_of_code" stroke="#60a5fa" fill="rgba(96, 165, 250, 0.18)" name="Lines changed" />
              <Line type="monotone" dataKey="commits" stroke="#f97316" strokeWidth={2} dot={false} name="Commits" />
              <Line type="monotone" dataKey="pull_requests" stroke="#a855f7" strokeWidth={2} dot={false} name="Pull requests" />
              <Line type="monotone" dataKey="api_errors" stroke="#ef4444" strokeWidth={2} dot={false} name="API errors" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatChip label="Latest active time" value={fmtDurationSeconds((latest?.active_time_user_s ?? 0) + (latest?.active_time_cli_s ?? 0))} />
        <StatChip label="Latest API latency" value={fmtDurationSeconds(latest?.api_avg_duration_ms ?? 0)} />
        <StatChip label="Latest lines changed" value={fmtCompact(latest?.lines_of_code ?? 0)} />
        <StatChip label="Latest error rate" value={fmtPercent(latest && latest.api_requests > 0 ? latest.api_errors / latest.api_requests : 0)} />
      </div>
    </section>
  );
}
