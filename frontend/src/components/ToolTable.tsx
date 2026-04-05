import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLiveFeed } from "../hooks/useLiveFeed";
import { fmtCompact, fmtDurationMs, fmtPercent } from "../lib/format";

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
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Tool quality</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Reliability and latency by tool</h2>
        </div>
        <div className="text-xs text-slate-400">
          Sorted by <span className="text-slate-200">{sortKey}</span>
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
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
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
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No tool data yet, start a Claude Code session
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
