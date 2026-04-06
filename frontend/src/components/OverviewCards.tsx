import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtCompact, fmtCurrency, fmtDurationSeconds, fmtPercent } from "../lib/format";

type Overview = {
  today: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    cost_usd: number;
    cache_savings_usd: number;
    sessions: number;
    active_time_user_s: number;
    active_time_cli_s: number;
    lines_added: number;
    lines_removed: number;
    commits: number;
    pull_requests: number;
    api_requests: number;
    api_errors: number;
    tool_success_rate: number;
  };
  alltime: {
    sessions: number;
    cost_usd: number;
    api_errors: number;
  };
};

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
  tool_calls?: number;
};

type Period = "today" | "week" | "month";

function sumRows(rows: DayRow[]): DayRow {
  return rows.reduce(
    (acc, r) => ({
      ...acc,
      input_tokens: acc.input_tokens + (r.input_tokens ?? 0),
      output_tokens: acc.output_tokens + (r.output_tokens ?? 0),
      cache_read_tokens: acc.cache_read_tokens + (r.cache_read_tokens ?? 0),
      cache_creation_tokens: acc.cache_creation_tokens + (r.cache_creation_tokens ?? 0),
      cost_usd: acc.cost_usd + (r.cost_usd ?? 0),
      sessions: acc.sessions + (r.sessions ?? 0),
      lines_added: acc.lines_added + (r.lines_added ?? 0),
      lines_removed: acc.lines_removed + (r.lines_removed ?? 0),
      lines_of_code: acc.lines_of_code + (r.lines_of_code ?? 0),
      active_time_user_s: acc.active_time_user_s + (r.active_time_user_s ?? 0),
      active_time_cli_s: acc.active_time_cli_s + (r.active_time_cli_s ?? 0),
      commits: acc.commits + (r.commits ?? 0),
      pull_requests: acc.pull_requests + (r.pull_requests ?? 0),
      api_requests: acc.api_requests + (r.api_requests ?? 0),
      api_errors: acc.api_errors + (r.api_errors ?? 0),
      api_avg_duration_ms: 0,
    }),
    {
      date: "", input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
      cache_creation_tokens: 0, cost_usd: 0, sessions: 0, lines_added: 0,
      lines_removed: 0, lines_of_code: 0, active_time_user_s: 0, active_time_cli_s: 0,
      commits: 0, pull_requests: 0, api_requests: 0, api_errors: 0, api_avg_duration_ms: 0,
    },
  );
}

function deltaLabel(current: number, previous: number, percent = false) {
  if (previous === 0) return current === 0 ? "flat" : "new";
  const delta = current - previous;
  const ratio = delta / previous;
  const sign = delta >= 0 ? "+" : "";
  return percent ? `${sign}${fmtPercent(ratio, 1)}` : `${sign}${fmtCompact(delta)}`;
}

function StatCard({ label, value, sub, delta }: { label: string; value: string; sub: string; delta: string }) {
  return (
    <div className="h-[146px] min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_20px_50px_rgba(2,6,23,0.22)] backdrop-blur-md">
      <div className="flex h-full flex-col justify-between gap-2">
        <div className="w-fit">
          <p className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{label}</p>
          <p className="mt-1.5 text-xl font-semibold tracking-tight text-slate-50">{value}</p>
          <p className="mt-1 whitespace-nowrap text-[11px] leading-none text-slate-400">{sub}</p>
        </div>
        <div className="inline-flex w-fit rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-slate-300">
          {delta}
        </div>
      </div>
    </div>
  );
}

export default function OverviewCards() {
  const [period, setPeriod] = useState<Period>("today");

  const { data: overview } = useQuery<Overview>({
    queryKey: ["overview"],
    queryFn: () => fetch("/api/overview").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  // Fetch enough days to cover month + prior month for comparison
  const { data: daily = [] } = useQuery<DayRow[]>({
    queryKey: ["daily", 60],
    queryFn: () => fetch("/api/daily?days=60").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  // Slice rows for current and comparison periods
  const periodDays = period === "today" ? 1 : period === "week" ? 7 : 30;
  const currentRows = daily.slice(-periodDays);
  const prevRows = daily.slice(-periodDays * 2, -periodDays);

  const cur = period === "today"
    ? (() => {
        const t = overview?.today;
        if (!t) return null;
        return {
          ...t,
          lines_of_code: (t.lines_added ?? 0) + (t.lines_removed ?? 0),
        } as DayRow & { cache_savings_usd: number; tool_success_rate: number };
      })()
    : sumRows(currentRows);

  const prev = sumRows(prevRows.length ? prevRows : currentRows);

  const totalTokens = (cur?.input_tokens ?? 0) + (cur?.output_tokens ?? 0);
  const prevTokens = (prev?.input_tokens ?? 0) + (prev?.output_tokens ?? 0);
  const activeSeconds = (cur?.active_time_user_s ?? 0) + (cur?.active_time_cli_s ?? 0);
  const linesChanged = (cur?.lines_added ?? 0) + (cur?.lines_removed ?? 0);
  const cacheHits =
    (cur?.input_tokens ?? 0) + (cur?.cache_read_tokens ?? 0) + (cur?.cache_creation_tokens ?? 0) > 0
      ? (cur?.cache_read_tokens ?? 0) /
        ((cur?.input_tokens ?? 0) + (cur?.cache_read_tokens ?? 0) + (cur?.cache_creation_tokens ?? 0))
      : 0;

  const costPerLine = linesChanged > 0 ? (cur?.cost_usd ?? 0) / linesChanged : 0;
  const costPerCommit = (cur?.commits ?? 0) > 0 ? (cur?.cost_usd ?? 0) / (cur?.commits ?? 0) : 0;
  const burnRate = activeSeconds > 0 ? ((cur?.cost_usd ?? 0) / activeSeconds) * 3600 : 0;

  // cache_savings_usd and tool_success_rate only available for "today"
  const cacheSavingsUsd = period === "today" ? ((cur as any)?.cache_savings_usd ?? 0) : null;
  const toolSuccessRate = period === "today" ? ((cur as any)?.tool_success_rate ?? 0) : null;
  const cacheSavingsPercent = (cur?.cost_usd ?? 0) > 0 && cacheSavingsUsd != null
    ? (cacheSavingsUsd / (cur?.cost_usd ?? 0)) * 100
    : null;

  const periodLabel = period === "today" ? "today" : period === "week" ? "7d" : "30d";
  const compLabel = period === "today" ? "vs yesterday" : period === "week" ? "vs prior 7d" : "vs prior 30d";

  const cards = [
    {
      label: "Cost",
      value: fmtCurrency(cur?.cost_usd ?? 0, 4),
      sub: `all ${fmtCurrency(overview?.alltime.cost_usd ?? 0, 2)}`,
      delta: deltaLabel(cur?.cost_usd ?? 0, prev?.cost_usd ?? 0, true) + " " + compLabel,
    },
    {
      label: "Tokens",
      value: fmtCompact(totalTokens),
      sub: `${fmtCompact(cur?.input_tokens ?? 0)} in · ${fmtCompact(cur?.output_tokens ?? 0)} out`,
      delta: deltaLabel(totalTokens, prevTokens, true) + " " + compLabel,
    },
    {
      label: "Lines",
      value: fmtCompact(linesChanged),
      sub: `${fmtCompact(cur?.lines_added ?? 0)} added · ${fmtCompact(cur?.lines_removed ?? 0)} removed`,
      delta: deltaLabel(linesChanged, (prev?.lines_of_code ?? 0), true) + " " + compLabel,
    },
    {
      label: "Time",
      value: fmtDurationSeconds(activeSeconds),
      sub: `${fmtDurationSeconds(cur?.active_time_user_s ?? 0)} typing · ${fmtDurationSeconds(cur?.active_time_cli_s ?? 0)} CLI`,
      delta: `${periodLabel} active`,
    },
    {
      label: toolSuccessRate != null ? "Success" : "API Requests",
      value: toolSuccessRate != null ? fmtPercent(toolSuccessRate) : fmtCompact(cur?.api_requests ?? 0),
      sub: `${fmtCompact(cur?.api_requests ?? 0)} req · ${fmtCompact(cur?.api_errors ?? 0)} err`,
      delta: `${fmtCompact(overview?.alltime.api_errors ?? 0)} err all`,
    },
    {
      label: "Cache Hit",
      value: fmtPercent(cacheHits),
      sub: `${fmtCompact(cur?.cache_read_tokens ?? 0)} read · ${fmtCompact(cur?.cache_creation_tokens ?? 0)} create`,
      delta: deltaLabel(cacheHits, prev ? (prev.cache_read_tokens / Math.max(prev.input_tokens + prev.cache_read_tokens + prev.cache_creation_tokens, 1)) : 0, true) + " " + compLabel,
    },
  ];

  const efficiencyCards = [
    {
      label: "Cost / Commit",
      value: fmtCurrency(costPerCommit, 4),
      sub: `${fmtCompact(cur?.commits ?? 0)} commits · ${fmtCompact(cur?.pull_requests ?? 0)} PRs`,
      delta: deltaLabel(costPerCommit, prev && (prev.commits ?? 0) > 0 ? prev.cost_usd / prev.commits : 0, true),
    },
    {
      label: "Cost / Line",
      value: fmtCurrency(costPerLine, 4),
      sub: `${fmtCompact(linesChanged)} lines ${periodLabel}`,
      delta: deltaLabel(costPerLine, prev && (prev.lines_of_code ?? 0) > 0 ? prev.cost_usd / prev.lines_of_code : 0, true),
    },
    {
      label: "Cache Savings",
      value: cacheSavingsUsd != null ? fmtCurrency(cacheSavingsUsd, 4) : "—",
      sub: cacheSavingsPercent != null ? `${fmtCompact(cacheSavingsPercent)}% of cost` : "today only",
      delta: cacheSavingsUsd != null ? `saved ${periodLabel}` : "today view only",
    },
    {
      label: "Burn Rate",
      value: fmtCurrency(burnRate, 2) + "/hr",
      sub: `${fmtDurationSeconds(activeSeconds)} active ${periodLabel}`,
      delta: "hourly",
    },
  ];

  const PERIODS: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
  ];

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Overview</p>
        <div className="flex gap-1.5">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                period === key
                  ? "border-white/20 bg-white/10 text-slate-50"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid w-full grid-cols-6 gap-2 pb-1">
        {cards.map((card) => (
          <div key={card.label} className="min-w-0">
            <StatCard {...card} />
          </div>
        ))}
      </div>

      <div className="grid w-full grid-cols-4 gap-2 pb-1">
        {efficiencyCards.map((card) => (
          <div key={card.label} className="min-w-0">
            <StatCard {...card} />
          </div>
        ))}
      </div>
    </section>
  );
}
