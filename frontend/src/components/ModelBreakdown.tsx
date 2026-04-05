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

type ModelRow = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  cost_usd: number;
  request_count: number;
  error_count: number;
  avg_duration_ms: number;
  cache_hit_rate: number;
  output_input_ratio: number;
  cost_per_request_usd: number;
  error_rate: number;
};

export default function ModelBreakdown() {
  const { data = [] } = useQuery<ModelRow[]>({
    queryKey: ["models"],
    queryFn: () => fetch("/api/models").then((r) => r.json()),
    refetchInterval: 60_000,
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
    <section className="rounded-3xl border border-white/10 bg-slate-950/85 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Model intelligence</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-50">Which model is expensive, efficient, or noisy?</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            Total spend {fmtCurrency(totalCost, 2)}
          </span>
          {top && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              Top model {shortId(top.model, 10, 4).replace("claude-", "")}
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-100">Cost by model</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 24, left: 8, bottom: 0 }}>
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

        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          <div className="border-b border-white/10 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-100">Efficiency table</h3>
            <p className="text-xs text-slate-400">Cost, cache hit rate, output/input ratio, and error pressure</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-black/20 text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Model</th>
                  <th className="px-4 py-3 text-right font-medium">Requests</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                  <th className="px-4 py-3 text-right font-medium">Cache</th>
                  <th className="px-4 py-3 text-right font-medium">Out/In</th>
                  <th className="px-4 py-3 text-right font-medium">Errors</th>
                  <th className="px-4 py-3 text-right font-medium">Cost / req</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.model} className="border-t border-white/10 hover:bg-white/5">
                    <td className="px-4 py-3 text-slate-100">{shortId(row.model, 12, 6).replace("claude-", "")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-200">{fmtCompact(row.request_count)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-300">{fmtCurrency(row.cost_usd, 4)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{fmtPercent(row.cache_hit_rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-sky-300">{row.output_input_ratio.toFixed(2)}x</td>
                    <td className="px-4 py-3 text-right tabular-nums text-rose-300">{fmtPercent(row.error_rate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">
                      {fmtCurrency(row.cost_per_request_usd, 4)}
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No model data yet
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
