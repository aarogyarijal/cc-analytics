import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fmtCompact, fmtCurrency, fmtDurationMs, fmtDurationSeconds, shortId } from "../lib/format";

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

type SortKey = "cost_usd" | "duration_ms" | "total_tokens" | "event_count" | "api_errors";

export default function SessionTable() {
  const { data = [] } = useQuery<SessionRow[]>({
    queryKey: ["sessions", 40],
    queryFn: () => fetch("/api/sessions?limit=40").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const [sortKey, setSortKey] = useState<SortKey>("cost_usd");
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(
    () =>
      [...data].sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        return asc ? av - bv : bv - av;
      }),
    [data, asc, sortKey],
  );

  const maxCost = sorted[0]?.cost_usd || 1;

  function th(key: SortKey, label: string) {
    return (
      <th
        className="cursor-pointer px-4 py-3 text-right font-medium text-slate-400 hover:text-slate-200"
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
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Session intelligence</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Drill into the sessions that cost the most</h2>
        </div>
        <p className="text-xs text-slate-400">Sorted by {sortKey.replace("_", " ")}</p>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-black/20">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Session</th>
                {th("cost_usd", "Cost")}
                {th("total_tokens", "Tokens")}
                {th("duration_ms", "Duration")}
                {th("event_count", "Events")}
              {th("api_errors", "Errors")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr key={row.session_id} className="border-t border-white/10 hover:bg-white/5">
                  <td className="px-3 py-2.5 text-slate-100">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono">{shortId(row.session_id, 9, 4)}</span>
                      <span className="text-[11px] text-slate-500">
                        {fmtCompact(row.api_calls)} API · {fmtCompact(row.tool_calls)} tools · {fmtCompact(row.prompt_count)} prompts
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-3">
                      <span className="text-amber-300">{fmtCurrency(row.cost_usd, 4)}</span>
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/10">
                        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(row.cost_usd / maxCost) * 100}%` }} />
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtCompact(row.total_tokens)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtDurationMs(row.duration_ms)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtCompact(row.event_count)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className={row.api_errors > 0 ? "text-rose-300" : "text-emerald-300"}>{fmtCompact(row.api_errors)}</span>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                    No session data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 border-t border-white/10 bg-black/20 px-3 py-2.5 text-[11px] text-slate-400 sm:grid-cols-4">
          <span>{fmtDurationSeconds(sorted.reduce((sum, row) => sum + row.active_time_user_s + row.active_time_cli_s, 0))} active time</span>
          <span>{fmtCompact(sorted.reduce((sum, row) => sum + row.lines_added + row.lines_removed, 0))} lines changed</span>
          <span>{fmtCompact(sorted.reduce((sum, row) => sum + row.commits, 0))} commits</span>
          <span>{fmtCompact(sorted.reduce((sum, row) => sum + row.pull_requests, 0))} PRs</span>
        </div>
      </div>
    </section>
  );
}
