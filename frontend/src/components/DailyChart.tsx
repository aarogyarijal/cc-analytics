import { useState } from "react";
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
  sessions?: number;
  lines_added?: number;
  lines_removed?: number;
  lines_of_code: number;
  active_time_user_s?: number;
  active_time_cli_s?: number;
  commits?: number;
  pull_requests?: number;
  api_requests: number;
  api_errors: number;
  api_avg_duration_ms?: number;
  tool_calls?: number;
  rolling_7d_cost_usd?: number;
};

type HourlyRow = {
  hour: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
  api_requests: number;
  api_errors: number;
  lines_of_code: number;
  tool_calls: number;
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

type EnhancedDayRow = DayRow & {
  cost_per_line: number;
  cost_per_commit: number;
  lines_per_hour: number;
};

type EnhancedHourlyRow = HourlyRow & {
  cost_per_line: number;
  lines_per_hour: number;
};

function formatHourLabel(hour: string): string {
  const [date, time] = hour.split(" ");
  return `${date.slice(-2)}/${time}`;
}

export default function DailyChart({ days = 30 }: { days?: number }) {
  const [view, setView] = useState<"day" | "week">("week");

  const { data: rawDailyData = [] } = useQuery<DayRow[]>({
    queryKey: ["daily", days],
    queryFn: () => fetch(`/api/daily?days=${days}`).then((r) => r.json()),
    refetchInterval: 60_000,
    enabled: view === "week",
  });

  const { data: rawHourlyData = [] } = useQuery<HourlyRow[]>({
    queryKey: ["hourly"],
    queryFn: () => fetch("/api/hourly?hours=24").then((r) => r.json()),
    refetchInterval: 60_000,
    enabled: view === "day",
  });

  // Enhance data based on view
  const dailyData: EnhancedDayRow[] = rawDailyData.map((row) => ({
    ...row,
    cost_per_line: row.lines_of_code > 0 ? row.cost_usd / row.lines_of_code : 0,
    cost_per_commit: (row.commits ?? 0) > 0 ? row.cost_usd / (row.commits ?? 0) : 0,
    lines_per_hour: ((row.active_time_user_s ?? 0) + (row.active_time_cli_s ?? 0)) > 0
      ? (row.lines_of_code / (((row.active_time_user_s ?? 0) + (row.active_time_cli_s ?? 0)) / 3600))
      : 0,
  }));

  const hourlyData: EnhancedHourlyRow[] = rawHourlyData.map((row) => ({
    ...row,
    cost_per_line: row.lines_of_code > 0 ? row.cost_usd / row.lines_of_code : 0,
    lines_per_hour: 0, // Not applicable for hourly view
  }));

  const data = view === "week" ? dailyData : hourlyData;
  const xAxisFormatter = view === "week" ? shortDate : formatHourLabel;

  const totals = data.reduce(
    (acc, row: any) => {
      acc.cost += row.cost_usd;
      acc.sessions += (row.sessions ?? 0);
      acc.tokens += row.input_tokens + row.output_tokens;
      acc.active += ((row.active_time_user_s ?? 0) + (row.active_time_cli_s ?? 0));
      acc.errors += row.api_errors;
      acc.lines += row.lines_of_code;
      acc.commits += (row.commits ?? 0);
      acc.prs += (row.pull_requests ?? 0);
      return acc;
    },
    { cost: 0, sessions: 0, tokens: 0, active: 0, errors: 0, lines: 0, commits: 0, prs: 0 },
  );

  const latest = data.at(-1) as any;
  const cacheShare = latest
    ? latest.input_tokens + latest.cache_read_tokens + latest.cache_creation_tokens > 0
      ? latest.cache_read_tokens / (latest.input_tokens + latest.cache_read_tokens + latest.cache_creation_tokens)
      : 0
    : 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Trend</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Usage</h2>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("day")}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "day"
                ? "border-white/20 bg-white/10 text-slate-50"
                : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            Day
          </button>
          <button
            onClick={() => setView("week")}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              view === "week"
                ? "border-white/20 bg-white/10 text-slate-50"
                : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            Week
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip label="Cost" value={fmtCurrency(totals.cost, 2)} />
          <StatChip label="Tokens" value={fmtCompact(totals.tokens)} />
          <StatChip label="Sessions" value={fmtCompact(totals.sessions)} />
          <StatChip label="Cache" value={fmtPercent(cacheShare)} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Tokens / cost</h3>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={data as any} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey={view === "week" ? "date" : "hour"} tickFormatter={xAxisFormatter} tick={{ fontSize: 11, fill: "#94a3b8" }} />
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
              <Bar yAxisId="tokens" dataKey="cache_creation_tokens" stackId="tokens" fill="#6366f1" name="Cache creation" />
              <Line yAxisId="cost" dataKey="cost_usd" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Cost" />
              <Line yAxisId="cost" dataKey="rolling_7d_cost_usd" stroke="rgba(245,158,11,0.5)" strokeWidth={2} strokeDasharray="4 2" dot={false} name="7d avg cost" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Activity</h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data as any} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
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

        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Efficiency</h3>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data as any} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis yAxisId="efficiency" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCurrency(Number(v), 2)} />
              <YAxis yAxisId="productivity" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${fmtCompact(Number(v))}/hr`} />
              <Tooltip
                contentStyle={{
                  background: "rgba(2, 6, 23, 0.95)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: "12px",
                  color: "#e2e8f0",
                }}
                formatter={(value, name) => {
                  const v = Number(value ?? 0);
                  if (name === "cost_per_line") return [fmtCurrency(v, 4), "Cost/Line"];
                  if (name === "cost_per_commit") return [fmtCurrency(v, 4), "Cost/Commit"];
                  if (name === "lines_per_hour") return [fmtCompact(v), "Lines/Hr"];
                  return [String(v), String(name)];
                }}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1" }} />
              <Bar yAxisId="efficiency" dataKey="cost_per_line" fill="rgba(245,158,11,0.4)" opacity={0.5} name="Cost/Line" />
              <Line yAxisId="efficiency" dataKey="cost_per_commit" stroke="#f59e0b" strokeWidth={2} dot={false} name="Cost/Commit" />
              <Line yAxisId="productivity" dataKey="lines_per_hour" stroke="#34d399" strokeWidth={2} dot={false} name="Lines/Hr" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {view === "week" && (
          <>
            <StatChip label="Active" value={fmtDurationSeconds(((latest as any)?.active_time_user_s ?? 0) + ((latest as any)?.active_time_cli_s ?? 0))} />
            <StatChip label="Latency" value={fmtDurationSeconds((latest as any)?.api_avg_duration_ms ?? 0)} />
          </>
        )}
        <StatChip label="Lines" value={fmtCompact(latest?.lines_of_code ?? 0)} />
        <StatChip label="Errors" value={fmtPercent(latest && latest.api_requests > 0 ? latest.api_errors / latest.api_requests : 0)} />
      </div>
    </section>
  );
}
