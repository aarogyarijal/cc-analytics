import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Treemap, ResponsiveContainer } from "recharts";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { fmtCompact, fmtDurationMs, fmtPercent, fmtDurationSeconds } from "../lib/format";

type ToolRow = {
  tool: string;
  calls: number;
  failures: number;
  success_rate: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  p95_duration_ms: number;
};

type SortKey = keyof ToolRow;

export default function ToolTable() {
  const qc = useQueryClient();
  const { events } = useLiveFeed();

  useEffect(() => {
    if (events[0]?.type === "tool_result") {
      qc.invalidateQueries({ queryKey: ["tools"] });
    }
  }, [events, qc]);

  const { data = [] } = useQuery<ToolRow[]>({
    queryKey: ["tools"],
    queryFn: () => fetch("/api/tools").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const [sortKey, setSortKey] = useState<SortKey>("calls");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(
    () =>
      [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") return asc ? av - bv : bv - av;
        return asc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      }),
    [data, asc, sortKey],
  );

  const maxCalls = sorted[0]?.calls ?? 1;

  function th(key: SortKey, label: string, right = true) {
    return (
      <th
        className={`cursor-pointer select-none px-4 py-3 font-medium text-slate-400 hover:text-slate-200 ${right ? "text-right" : "text-left"}`}
        onClick={() => {
          if (sortKey === key) setAsc(!asc);
          else {
            setSortKey(key);
            setAsc(false);
          }
        }}
      >
        {label} {sortKey === key ? (asc ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Tools</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Latency</h2>
        </div>
        <div className="text-xs text-slate-400">{sortKey}</div>
      </div>

      {/* Treemap visualization */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-2.5">
        <h3 className="mb-2 text-sm font-semibold text-slate-100">Time Budget by Tool</h3>
        <ResponsiveContainer width="100%" height={120}>
          <Treemap
            data={sorted.map((row) => ({
              name: row.tool,
              value: Math.max((row.avg_duration_ms * row.calls) / 1000, 1), // seconds
              success_rate: row.success_rate,
            }))}
            dataKey="value"
            stroke="rgba(148,163,184,0.18)"
            fill="#38bdf8"
            content={({ x, y, width, height, payload }: any) => {
              const sr = (payload?.success_rate as number) || 0;
              const fillColor = sr >= 0.95 ? "#22c55e" : sr >= 0.8 ? "#f59e0b" : "#ef4444";
              return (
                <g>
                  <rect x={x} y={y} width={width} height={height} fill={fillColor} fillOpacity={0.3} stroke="rgba(148,163,184,0.18)" />
                  {width > 40 && height > 20 && (
                    <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill="#cbd5e1" fontSize={11} fontWeight={600}>
                      {payload?.name}
                    </text>
                  )}
                </g>
              );
            }}
          />
        </ResponsiveContainer>
        <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-500">
          <span>Size = avg duration x calls.</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: "rgba(34,197,94,0.3)" }} />&ge;95% success</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: "rgba(245,158,11,0.3)" }} />&ge;80%</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm" style={{ background: "rgba(239,68,68,0.3)" }} />&lt;80%</span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <table className="w-full text-xs">
          <thead className="bg-black/20">
            <tr>
              {th("tool", "Tool", false)}
              {th("calls", "Calls")}
              {th("success_rate", "Success")}
              {th("failures", "Fails")}
              {th("avg_duration_ms", "Avg")}
              {th("p95_duration_ms", "P95")}
              {th("max_duration_ms", "Max")}
              <th className={`cursor-pointer select-none px-4 py-3 font-medium text-slate-400 hover:text-slate-200 text-right`} title="P95/Avg ratio — red >3x, amber >1.5x. High = inconsistent latency">
                Bottleneck
              </th>
              <th className={`cursor-pointer select-none px-4 py-3 font-medium text-slate-400 hover:text-slate-200 text-right`} title="Total time spent: avg duration x call count">
                Time Budget
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const bottleneck = row.avg_duration_ms > 0 ? row.p95_duration_ms / row.avg_duration_ms : 1;
              const timeBudget = (row.avg_duration_ms * row.calls) / 1000; // in seconds
              const bottleneckColor = bottleneck > 3 ? "text-rose-300" : bottleneck > 1.5 ? "text-amber-300" : "text-slate-400";

              return (
                <tr key={row.tool} className="border-t border-white/10 hover:bg-white/5">
                  <td className="px-3 py-2.5 font-mono text-slate-100">{row.tool}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-3">
                      <span className="text-slate-200">{fmtCompact(row.calls)}</span>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full bg-sky-400"
                          style={{ width: `${(row.calls / maxCalls) * 100}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span
                      className={
                        row.success_rate >= 0.95
                          ? "text-emerald-300"
                          : row.success_rate >= 0.8
                            ? "text-amber-300"
                            : "text-rose-300"
                      }
                    >
                      {fmtPercent(row.success_rate)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-300">{fmtCompact(row.failures)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtDurationMs(row.avg_duration_ms)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-cyan-300">{fmtDurationMs(row.p95_duration_ms)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmtDurationMs(row.max_duration_ms)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${bottleneckColor}`}>{bottleneck.toFixed(1)}×</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-300">{fmtDurationSeconds(timeBudget)}</td>
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 px-3 py-2 text-[10px] text-slate-500">
          <span>Success: <span className="text-emerald-400">&ge;95%</span> <span className="text-amber-400">&ge;80%</span> <span className="text-rose-400">&lt;80%</span></span>
          <span>Bottleneck: <span className="text-rose-400">&gt;3x</span> <span className="text-amber-400">&gt;1.5x</span> (P95/Avg ratio)</span>
        </div>
      </div>
    </section>
  );
}
