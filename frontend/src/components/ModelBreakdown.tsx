import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { fmtCompact, fmtCurrency, fmtPercent, shortId } from "../lib/format";
import { calculateCacheSavings } from "../lib/pricing";

type ModelRow = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
  cache_savings_usd?: number;
  request_count: number;
  error_count: number;
  avg_duration_ms: number;
  cache_hit_rate: number;
  output_input_ratio: number;
  cost_per_request_usd: number;
  error_rate: number;
};

type SortKey = "request_count" | "cost_usd" | "cache_hit_rate" | "output_input_ratio" | "error_rate" | "throughput" | "cache_savings" | "adj_cost";
type SortDir = "asc" | "desc";

function getThroughput(row: ModelRow) {
  return row.avg_duration_ms > 0 ? row.output_tokens / (row.avg_duration_ms / 1000) : 0;
}

function getCacheSavings(row: ModelRow) {
  return row.cache_savings_usd ?? calculateCacheSavings(row.model, row.cache_read_tokens, row.cost_usd / Math.max(row.input_tokens + row.cache_read_tokens, 1) * 1_000_000);
}

function getAdjCost(row: ModelRow) {
  return row.error_rate > 0 && row.error_rate < 1
    ? row.cost_per_request_usd / (1 - row.error_rate)
    : row.cost_per_request_usd;
}

function getSortValue(row: ModelRow, key: SortKey): number {
  switch (key) {
    case "throughput": return getThroughput(row);
    case "cache_savings": return getCacheSavings(row);
    case "adj_cost": return getAdjCost(row);
    default: return row[key] as number;
  }
}

function SortHeader({ label, sortKey, current, dir, onSort, title }: { label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onSort: (k: SortKey) => void; title?: string }) {
  return (
    <th
      className="px-3 py-2.5 text-right font-medium text-slate-400 cursor-pointer select-none hover:text-slate-200 transition-colors"
      onClick={() => onSort(sortKey)}
      title={title}
    >
      {label} {current === sortKey ? (dir === "desc" ? "↓" : "↑") : ""}
    </th>
  );
}

export default function ModelBreakdown() {
  const { data = [] } = useQuery<ModelRow[]>({
    queryKey: ["models"],
    queryFn: () => fetch("/api/models").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const [sortKey, setSortKey] = useState<SortKey>("cost_usd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sorted = [...data].sort((a, b) => {
    const av = getSortValue(a, sortKey);
    const bv = getSortValue(b, sortKey);
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const chartData = [...data]
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, 8)
    .map((row) => ({
      model: shortId(row.model, 12, 6).replace("claude-", ""),
      cost: row.cost_usd,
      requests: row.request_count,
      tokens: row.input_tokens + row.output_tokens + row.cache_read_tokens + row.cache_creation_tokens,
    }));

  const top = data[0];
  const totalCost = data.reduce((sum, row) => sum + row.cost_usd, 0);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Models</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Cost / efficiency</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            Spend {fmtCurrency(totalCost, 2)}
          </span>
          {top && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              Top {shortId(top.model, 10, 4).replace("claude-", "")}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.95fr]">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <h3 className="mb-2 text-sm font-semibold text-slate-100">Cost by model</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => fmtCurrency(Number(v), 0)} />
              <YAxis type="category" dataKey="model" tick={{ fontSize: 11, fill: "#cbd5e1" }} width={110} />
              <Tooltip
                contentStyle={{
                  background: "rgba(2, 6, 23, 0.95)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  borderRadius: "12px",
                  color: "#e2e8f0",
                }}
                formatter={(value, name) => {
                  if (name === "cost") return [fmtCurrency(Number(value ?? 0), 4), "Cost"];
                  if (name === "requests") return [fmtCompact(Number(value ?? 0)), "Requests"];
                  return [fmtCompact(Number(value ?? 0)), "Tokens"];
                }}
              />
              <Legend wrapperStyle={{ color: "#cbd5e1" }} />
              <Bar dataKey="cost" fill="#f59e0b" name="Cost" radius={[0, 8, 8, 0]} />
              <Bar dataKey="requests" fill="#38bdf8" name="Requests" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-3 py-2.5">
            <h3 className="text-sm font-semibold text-slate-100">Table</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-black/20 text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium">Model</th>
                  <SortHeader label="Req" sortKey="request_count" current={sortKey} dir={sortDir} onSort={handleSort} title="Total API requests" />
                  <SortHeader label="Cost" sortKey="cost_usd" current={sortKey} dir={sortDir} onSort={handleSort} title="Total spend" />
                  <SortHeader label="Cache" sortKey="cache_hit_rate" current={sortKey} dir={sortDir} onSort={handleSort} title="Cache hit rate: cache_read / (input + cache_read + cache_creation)" />
                  <SortHeader label="Out/In" sortKey="output_input_ratio" current={sortKey} dir={sortDir} onSort={handleSort} title="Output-to-input token ratio" />
                  <SortHeader label="Err" sortKey="error_rate" current={sortKey} dir={sortDir} onSort={handleSort} title="Error rate: errors / requests" />
                  <SortHeader label="Thrpt" sortKey="throughput" current={sortKey} dir={sortDir} onSort={handleSort} title="Throughput: output tokens per second" />
                  <SortHeader label="Saved" sortKey="cache_savings" current={sortKey} dir={sortDir} onSort={handleSort} title="Cache savings: money saved by cache hits vs full-price input" />
                  <SortHeader label="Adj $/req" sortKey="adj_cost" current={sortKey} dir={sortDir} onSort={handleSort} title="Adjusted cost per request: cost/req divided by (1 - error_rate)" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const throughput = getThroughput(row).toFixed(1);
                  const cacheSavings = getCacheSavings(row);
                  const adjCostPerReq = getAdjCost(row);

                  return (
                    <tr key={row.model} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-3 py-2.5 text-slate-100">{shortId(row.model, 12, 6).replace("claude-", "")}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtCompact(row.request_count)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-300">{fmtCurrency(row.cost_usd, 4)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{fmtPercent(row.cache_hit_rate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sky-300">{row.output_input_ratio.toFixed(2)}x</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-rose-300">{fmtPercent(row.error_rate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sky-300">{throughput} tok/s</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-300">{fmtCurrency(cacheSavings, 4)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-300">{fmtCurrency(adjCostPerReq, 4)}</td>
                    </tr>
                  );
                })}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                      No data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
