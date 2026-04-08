import { useQuery } from "@tanstack/react-query";
import { fmtCompact, fmtCurrency, fmtDurationSeconds, fmtPercent } from "../lib/format";
import { useDashboard } from "../lib/DashboardContext";

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

type EnvRow = {
  date: string;
  co2_kg: number;
  energy_kwh: number;
  cache_saved_co2_kg: number;
};

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

function StatCard({ label, value, sub, delta, scrollTo, title }: { label: string; value: string; sub: string; delta: string; scrollTo?: string; title?: string }) {
  const handleClick = () => {
    if (!scrollTo) return;
    const el = document.getElementById(scrollTo);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      onClick={handleClick}
      title={title}
      className={`h-[146px] min-w-0 rounded-2xl border border-white/10 bg-white/5 p-3 shadow-[0_20px_50px_rgba(2,6,23,0.22)] backdrop-blur-md${scrollTo ? " cursor-pointer hover:bg-white/[0.08] transition-colors" : ""}`}
    >
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
  const { period } = useDashboard();

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

  const { data: envData = [] } = useQuery<EnvRow[]>({
    queryKey: ["environmental", 60],
    queryFn: () => fetch("/api/environmental?days=60").then((r) => r.json()),
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
  // Environmental: sum CO2 and energy for current + prior period
  const envCurrent = envData.slice(-periodDays);
  const envPrev = envData.slice(-periodDays * 2, -periodDays);
  const co2Kg = envCurrent.reduce((s, r) => s + r.co2_kg, 0);
  const prevCo2Kg = envPrev.reduce((s, r) => s + r.co2_kg, 0);
  const energyKwh = envCurrent.reduce((s, r) => s + r.energy_kwh, 0);

  const TREE_KG_PER_DAY = 22 / 365;
  const treeDays = co2Kg / TREE_KG_PER_DAY;
  const prevTreeDays = prevCo2Kg / TREE_KG_PER_DAY;

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
      scrollTo: "section-usage",
    },
    {
      label: "Tokens",
      value: fmtCompact(totalTokens),
      sub: `${fmtCompact(cur?.input_tokens ?? 0)} in · ${fmtCompact(cur?.output_tokens ?? 0)} out`,
      delta: deltaLabel(totalTokens, prevTokens, true) + " " + compLabel,
      scrollTo: "section-models",
    },
    {
      label: "Lines",
      value: fmtCompact(linesChanged),
      sub: `${fmtCompact(cur?.lines_added ?? 0)} added · ${fmtCompact(cur?.lines_removed ?? 0)} removed`,
      delta: deltaLabel(linesChanged, (prev?.lines_of_code ?? 0), true) + " " + compLabel,
      scrollTo: "section-sessions",
    },
    {
      label: "Time",
      value: fmtDurationSeconds(activeSeconds),
      sub: `${fmtDurationSeconds(cur?.active_time_user_s ?? 0)} typing · ${fmtDurationSeconds(cur?.active_time_cli_s ?? 0)} CLI`,
      delta: `${periodLabel} active`,
      scrollTo: "section-sessions",
    },
    {
      label: toolSuccessRate != null ? "Success" : "API Requests",
      value: toolSuccessRate != null ? fmtPercent(toolSuccessRate) : fmtCompact(cur?.api_requests ?? 0),
      sub: `${fmtCompact(cur?.api_requests ?? 0)} req · ${fmtCompact(cur?.api_errors ?? 0)} err`,
      delta: `${fmtCompact(overview?.alltime.api_errors ?? 0)} err all`,
      scrollTo: "section-errors",
    },
    {
      label: "Cache Hit",
      value: fmtPercent(cacheHits),
      sub: `${fmtCompact(cur?.cache_read_tokens ?? 0)} read · ${fmtCompact(cur?.cache_creation_tokens ?? 0)} create`,
      delta: deltaLabel(cacheHits, prev ? (prev.cache_read_tokens / Math.max(prev.input_tokens + prev.cache_read_tokens + prev.cache_creation_tokens, 1)) : 0, true) + " " + compLabel,
      scrollTo: "section-models",
    },
  ];

  const efficiencyCards = [
    {
      label: "Cost / Commit",
      value: fmtCurrency(costPerCommit, 4),
      sub: `${fmtCompact(cur?.commits ?? 0)} commits · ${fmtCompact(cur?.pull_requests ?? 0)} PRs`,
      delta: deltaLabel(costPerCommit, prev && (prev.commits ?? 0) > 0 ? prev.cost_usd / prev.commits : 0, true),
      scrollTo: "section-sessions",
      title: "Average cost per git commit",
    },
    {
      label: "Cost / Line",
      value: fmtCurrency(costPerLine, 4),
      sub: `${fmtCompact(linesChanged)} lines ${periodLabel}`,
      delta: deltaLabel(costPerLine, prev && (prev.lines_of_code ?? 0) > 0 ? prev.cost_usd / prev.lines_of_code : 0, true),
      scrollTo: "section-usage",
      title: "Cost per line of code changed (added + removed)",
    },
    {
      label: "Cache Savings",
      value: cacheSavingsUsd != null ? fmtCurrency(cacheSavingsUsd, 4) : "—",
      sub: cacheSavingsPercent != null ? `${fmtCompact(cacheSavingsPercent)}% of cost` : "today only",
      delta: cacheSavingsUsd != null ? `saved ${periodLabel}` : "today view only",
      scrollTo: "section-models",
      title: "Money saved by cache hits vs full-price input tokens",
    },
    {
      label: "Burn Rate",
      value: fmtCurrency(burnRate, 2) + "/hr",
      sub: `${fmtDurationSeconds(activeSeconds)} active ${periodLabel}`,
      delta: "hourly",
      scrollTo: "section-usage",
      title: "Cost per hour of active coding time",
    },
    {
      label: "Tree-Days",
      value: treeDays < 0.01 ? treeDays.toFixed(4) : treeDays < 1 ? treeDays.toFixed(3) : treeDays.toFixed(2),
      sub: `${energyKwh < 0.001 ? (energyKwh * 1000).toFixed(2) + " Wh" : energyKwh.toFixed(4) + " kWh"} · ${(co2Kg * 1000).toFixed(1)} g CO₂`,
      delta: prevTreeDays > 0 ? deltaLabel(treeDays, prevTreeDays, true) + " " + compLabel : `${periodLabel} total`,
      scrollTo: "section-environmental",
      title: "Days one tree would need to absorb this CO₂ (22 kg/year per tree)",
    },
  ];

  // Cost anomaly: compare today vs 7-day average
  const last7 = daily.slice(-8, -1); // exclude today
  const avg7dCost = last7.length > 0 ? last7.reduce((s, r) => s + r.cost_usd, 0) / last7.length : 0;
  const todayCost = daily.length > 0 ? daily[daily.length - 1]?.cost_usd ?? 0 : 0;
  const costRatio = avg7dCost > 0 ? todayCost / avg7dCost : 0;
  const showAnomaly = costRatio > 2 && todayCost > 0.01;

  return (
    <section className="space-y-2">
      {showAnomaly && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 backdrop-blur-md">
          <span className="text-base">⚠</span>
          <span>
            Today's cost ({fmtCurrency(todayCost, 4)}) is{" "}
            <span className="font-semibold text-amber-100">{costRatio.toFixed(1)}x</span> the 7-day avg (
            {fmtCurrency(avg7dCost, 4)}/day)
          </span>
        </div>
      )}
      <div className="grid w-full grid-cols-6 gap-2 pb-1">
        {cards.map((card) => (
          <div key={card.label} className="min-w-0">
            <StatCard {...card} />
          </div>
        ))}
      </div>

      <div className="grid w-full grid-cols-5 gap-2 pb-1">
        {efficiencyCards.map((card) => (
          <div key={card.label} className="min-w-0">
            <StatCard {...card} />
          </div>
        ))}
      </div>
    </section>
  );
}
