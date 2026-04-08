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
import { fmtCompact, fmtCurrency, fmtPercent } from "../lib/format";
import { useDashboard } from "../lib/DashboardContext";

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

type EnhancedRow = HourlyRow & {
  cost_per_line: number;
  lines_per_hour: number;
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function formatHourLabel(hour: string): string {
  const [date, time] = hour.split(" ");
  return `${date.slice(-2)}/${time}`;
}

export default function DailyChart() {
  const { currentInterval: opt } = useDashboard();

  const { data: rawData = [] } = useQuery<HourlyRow[]>({
    queryKey: ["interval", opt.interval_hours, opt.total_hours],
    queryFn: () =>
      fetch(`/api/interval?interval_hours=${opt.interval_hours}&total_hours=${opt.total_hours}`).then((r) =>
        r.json(),
      ),
    refetchInterval: 60_000,
  });

  const data: EnhancedRow[] = rawData.map((row) => ({
    ...row,
    cost_per_line: row.lines_of_code > 0 ? row.cost_usd / row.lines_of_code : 0,
    lines_per_hour: row.lines_of_code / opt.interval_hours,
  }));

  const totals = data.reduce(
    (acc, row) => {
      acc.cost += row.cost_usd;
      acc.tokens += row.input_tokens + row.output_tokens;
      acc.errors += row.api_errors ?? 0;
      acc.api_requests += row.api_requests ?? 0;
      acc.tool_calls += row.tool_calls ?? 0;
      acc.lines += row.lines_of_code ?? 0;
      return acc;
    },
    { cost: 0, tokens: 0, errors: 0, api_requests: 0, tool_calls: 0, lines: 0 },
  );

  const latest = data.at(-1);
  const cacheShare =
    latest && latest.input_tokens + latest.cache_read_tokens + latest.cache_creation_tokens > 0
      ? latest.cache_read_tokens /
        (latest.input_tokens + latest.cache_read_tokens + latest.cache_creation_tokens)
      : 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Trend</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Usage</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatChip label="Cost" value={fmtCurrency(totals.cost, 2)} />
          <StatChip label="Tokens" value={fmtCompact(totals.tokens)} />
          <StatChip label="Requests" value={fmtCompact(totals.api_requests)} />
          <StatChip label="Cache" value={fmtPercent(cacheShare)} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <h3 className="mb-2 text-sm font-semibold text-slate-100">Tokens / cost</h3>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={data as any} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="hour" tickFormatter={formatHourLabel} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis yAxisId="tokens" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(Number(v))} label={{ value: "Tokens", angle: -90, position: "insideLeft", style: { fill: "#64748b", fontSize: 10 } }} />
                <YAxis yAxisId="cost" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCurrency(Number(v), 2)} label={{ value: "Cost ($)", angle: 90, position: "insideRight", style: { fill: "#64748b", fontSize: 10 } }} />
                <Tooltip
                  contentStyle={{ background: "rgba(2,6,23,0.95)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: "12px", color: "#e2e8f0" }}
                  labelFormatter={(label) => formatHourLabel(String(label))}
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
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
            <h3 className="mb-2 text-sm font-semibold text-slate-100">Activity</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data as any} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis dataKey="hour" tickFormatter={formatHourLabel} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCompact(Number(v))} />
                <Tooltip
                  contentStyle={{ background: "rgba(2,6,23,0.95)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: "12px", color: "#e2e8f0" }}
                  formatter={(value, name) => [fmtCompact(Number(value ?? 0)), String(name).replaceAll("_", " ")]}
                />
                <Legend wrapperStyle={{ color: "#cbd5e1" }} />
                <Area type="monotone" dataKey="lines_of_code" stroke="#60a5fa" fill="rgba(96,165,250,0.18)" name="Lines changed" />
                <Line type="monotone" dataKey="api_requests" stroke="#34d399" strokeWidth={2} dot={false} name="API requests" />
                <Line type="monotone" dataKey="tool_calls" stroke="#a855f7" strokeWidth={2} dot={false} name="Tool calls" />
                <Line type="monotone" dataKey="api_errors" stroke="#ef4444" strokeWidth={2} dot={false} name="API errors" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border border-white/10 bg-white/5 p-2.5">
          <h3 className="mb-2 text-sm font-semibold text-slate-100">Efficiency</h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={data as any} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis dataKey="hour" tickFormatter={formatHourLabel} tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis yAxisId="efficiency" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCurrency(Number(v), 2)} label={{ value: "$/Line", angle: -90, position: "insideLeft", style: { fill: "#64748b", fontSize: 10 } }} />
              <YAxis yAxisId="productivity" orientation="right" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `${fmtCompact(Number(v))}/hr`} label={{ value: "Lines/Hr", angle: 90, position: "insideRight", style: { fill: "#64748b", fontSize: 10 } }} />
              <Tooltip
                contentStyle={{ background: "rgba(2,6,23,0.95)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: "12px", color: "#e2e8f0" }}
                formatter={(value, name) => {
                  const v = Number(value ?? 0);
                  if (name === "cost_per_line") return [fmtCurrency(v, 4), "Cost/Line"];
                  if (name === "lines_per_hour") return [fmtCompact(v), "Lines/Hr"];
                  return [String(v), String(name)];
                }}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1" }} />
              <Bar yAxisId="efficiency" dataKey="cost_per_line" fill="rgba(245,158,11,0.4)" opacity={0.5} name="Cost/Line" />
              <Line yAxisId="productivity" dataKey="lines_per_hour" stroke="#34d399" strokeWidth={2} dot={false} name="Lines/Hr" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatChip label="API Calls" value={fmtCompact(totals.api_requests)} />
        <StatChip label="Tool Calls" value={fmtCompact(totals.tool_calls)} />
        <StatChip label="Lines" value={fmtCompact(totals.lines)} />
        <StatChip label="Error Rate" value={fmtPercent(totals.api_requests > 0 ? totals.errors / totals.api_requests : 0)} />
      </div>
    </section>
  );
}
