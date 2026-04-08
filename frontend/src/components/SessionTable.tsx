import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fmtCompact, fmtCurrency, fmtDurationMs, fmtDurationSeconds, fmtPercent, shortId } from "../lib/format";

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

type SessionEvent = {
  ts: number;
  event_name: string;
  attrs: Record<string, unknown>;
};

type SortKey = "cost_usd" | "duration_ms" | "total_tokens" | "event_count" | "api_errors" | "end_ts";

const EVENT_COLORS: Record<string, string> = {
  api_request: "text-cyan-300",
  tool_result: "text-sky-300",
  user_prompt: "text-amber-300",
  api_error: "text-rose-300",
  tool_decision: "text-fuchsia-300",
};

const EVENT_DOTS: Record<string, string> = {
  api_request: "bg-cyan-400",
  tool_result: "bg-sky-400",
  user_prompt: "bg-amber-400",
  api_error: "bg-rose-400",
  tool_decision: "bg-fuchsia-400",
};

function SessionEventList({ sessionId }: { sessionId: string }) {
  const { data = [], isLoading } = useQuery<SessionEvent[]>({
    queryKey: ["session-events", sessionId],
    queryFn: () => fetch(`/api/session-events?session_id=${encodeURIComponent(sessionId)}`).then((r) => r.json()),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="px-4 py-3 text-[11px] text-slate-500">Loading events…</div>;
  if (data.length === 0) return <div className="px-4 py-3 text-[11px] text-slate-500">No events found</div>;

  return (
    <div className="max-h-64 overflow-y-auto px-4 py-2 space-y-1">
      {data.map((ev, i) => {
        const a = ev.attrs;
        const color = EVENT_COLORS[ev.event_name] ?? "text-slate-400";
        const dot = EVENT_DOTS[ev.event_name] ?? "bg-slate-500";
        const time = new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

        let info = ev.event_name;
        if (ev.event_name === "api_request") {
          const model = String(a.model ?? "").replace(/^claude-/, "").replace(/-\d{8}$/, "");
          const dur = a.duration_ms != null ? fmtDurationMs(Number(a.duration_ms)) : "";
          const cost = a.cost_usd != null ? fmtCurrency(Number(a.cost_usd), 4) : "";
          info = [model, dur, cost].filter(Boolean).join(" · ");
        } else if (ev.event_name === "tool_result") {
          const ok = a.success === "true" ? "✓" : "✗";
          const dur = a.duration_ms != null ? fmtDurationMs(Number(a.duration_ms)) : "";
          info = `${ok} ${a.tool_name ?? ""}${dur ? ` · ${dur}` : ""}`;
        } else if (ev.event_name === "user_prompt") {
          info = `prompt · ${a.prompt_length ?? "?"} chars`;
        } else if (ev.event_name === "api_error") {
          info = `HTTP ${a.status_code ?? "?"} · ${String(a.model ?? "").replace(/^claude-/, "")}`;
        }

        return (
          <div key={i} className="flex items-center gap-2 text-[11px] font-mono">
            <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${dot}`} />
            <span className="flex-shrink-0 tabular-nums text-slate-500 w-16">{time}</span>
            <span className={`truncate ${color}`}>{info}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function SessionTable() {
  const { data = [] } = useQuery<SessionRow[]>({
    queryKey: ["sessions", 500, 168],
    queryFn: () => fetch("/api/sessions?limit=500&since_hours=168").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const [sortKey, setSortKey] = useState<SortKey>("cost_usd");
  const [asc, setAsc] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

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
  const p90Cost = sorted[Math.floor(sorted.length * 0.1)]?.cost_usd || 0;

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
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Sessions</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">
            {{ cost_usd: "Costliest", duration_ms: "Longest", total_tokens: "Most Tokens", event_count: "Most Events", api_errors: "Most Errors", end_ts: "Recent" }[sortKey]}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInsights(!showInsights)}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
          >
            {showInsights ? "Standard" : "Insights"}
          </button>
          <p className="text-xs text-slate-400">{sortKey.replace("_", " ")}</p>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-black/20">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Session</th>
                {!showInsights ? (
                  <>
                    {th("cost_usd", "Cost")}
                    {th("total_tokens", "Tokens")}
                    {th("duration_ms", "Duration")}
                    {th("end_ts", "Last Event")}
                    {th("event_count", "Events")}
                    {th("api_errors", "Errors")}
                  </>
                ) : (
                  <>
                    <th className="px-4 py-3 text-right font-medium text-slate-400" title="API calls per prompt — higher means more agentic loops">Depth</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-400" title="Tool calls per API call — higher means more tool-heavy sessions">Tool Sat.</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-400" title="Cost per hour of active time">Burn Rate</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-400" title="Cost per line of code changed">$/Line</th>
                  </>
                )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isRunaway = row.cost_usd > p90Cost * 3 && row.commits === 0;
              const depthIndex = row.prompt_count > 0 ? row.api_calls / row.prompt_count : 0;
              const toolSaturation = row.api_calls > 0 ? row.tool_calls / row.api_calls : 0;
              const activeTime = row.active_time_user_s + row.active_time_cli_s;
              const burnRate = activeTime > 0 ? (row.cost_usd / (activeTime / 3600)) : 0;
              const linesChanged = row.lines_added + row.lines_removed;
              const costPerLine = linesChanged > 0 ? row.cost_usd / linesChanged : 0;
              const isExpanded = expandedSession === row.session_id;

              return (
                <>
                <tr
                  key={row.session_id}
                  data-session-id={row.session_id}
                  className={`border-t border-white/10 cursor-pointer transition-colors ${isExpanded ? "bg-white/5" : "hover:bg-white/5"} ${isRunaway ? "border-l-2 border-l-rose-500 bg-rose-500/5" : ""}`}
                  onClick={() => setExpandedSession(isExpanded ? null : row.session_id)}
                >
                  <td className="px-3 py-2.5 text-slate-100">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono flex items-center gap-1.5">
                        <span className={`text-[10px] transition-transform ${isExpanded ? "rotate-90" : ""}`}>▶</span>
                        {shortId(row.session_id, 9, 4)}
                      </span>
                      <span className="text-[11px] text-slate-500 pl-4">
                        {fmtCompact(row.api_calls)} API · {fmtCompact(row.tool_calls)} tools · {fmtCompact(row.prompt_count)} prompts
                      </span>
                    </div>
                  </td>
                  {!showInsights ? (
                    <>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-amber-300">{fmtCurrency(row.cost_usd, 4)}</span>
                          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white/10">
                            <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(row.cost_usd / maxCost) * 100}%` }} />
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{fmtCompact(row.total_tokens)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{fmtDurationMs(row.duration_ms)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400 text-[11px]">{new Date(row.end_ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{fmtCompact(row.event_count)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${row.api_errors > 0 ? "text-rose-300" : "text-emerald-300"}`}>{fmtCompact(row.api_errors)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2.5 text-right tabular-nums text-cyan-300">{depthIndex.toFixed(1)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-purple-300">{fmtPercent(toolSaturation)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-amber-300">{fmtCurrency(burnRate, 2)}/hr</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${costPerLine > 0.01 ? "text-rose-300" : "text-emerald-300"}`}>{fmtCurrency(costPerLine, 4)}</td>
                    </>
                  )}
                </tr>
                {isExpanded && (
                  <tr key={`${row.session_id}-events`} className="bg-white/5">
                    <td colSpan={showInsights ? 5 : 7} className="px-3 py-2">
                      <div className="rounded-lg border border-white/10 bg-black/20" onClick={(e) => e.stopPropagation()}>
                        <SessionEventList sessionId={row.session_id} />
                      </div>
                    </td>
                  </tr>
                )}
                </>
              );
            })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                    No data
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
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-[10px] text-slate-500">
          <span><span className="inline-block h-1.5 w-3 rounded-sm border-l-2 border-l-rose-500 bg-rose-500/10 mr-1 align-middle" />Runaway: cost &gt;3x p90 with no commits</span>
          {showInsights && (
            <>
              <span title="API calls per prompt — higher = more agentic loops">Depth = API calls / prompts</span>
              <span title="Tool calls per API call — higher = more tool-heavy">Tool Sat. = tool calls / API calls</span>
              <span title="Cost per hour of active time">Burn Rate = cost / active hours</span>
              <span title="Cost per line of code changed">$/Line = cost / lines changed</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
