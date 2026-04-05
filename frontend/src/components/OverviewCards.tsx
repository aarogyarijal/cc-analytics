import { useQuery } from "@tanstack/react-query";
import { fmtCompact, fmtCurrency, fmtDurationSeconds, fmtPercent } from "../lib/format";

type Overview = {
  today: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    cost_usd: number;
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
};

function Sparkline({ values, accent }: { values: number[]; accent: string }) {
  const width = 120;
  const height = 36;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / Math.max(max - min, 1)) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-28 shrink-0 overflow-visible">
      <polyline
        fill="none"
        stroke={accent}
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function deltaLabel(current: number, previous: number, percent = false) {
  if (previous === 0) {
    return current === 0 ? "flat" : "new";
  }
  const delta = current - previous;
  const ratio = delta / previous;
  const sign = delta >= 0 ? "+" : "";
  return percent ? `${sign}${fmtPercent(ratio, 1)}` : `${sign}${fmtCompact(delta)}`;
}

function StatCard({
  label,
  value,
  sub,
  delta,
  trend,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  delta: string;
  trend: number[];
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.22)] backdrop-blur-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-50">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{sub}</p>
        </div>
        <Sparkline values={trend} accent={accent} />
      </div>
      <div className="mt-3 inline-flex rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-slate-300">
        {delta}
      </div>
    </div>
  );
}

export default function OverviewCards() {
  const { data: overview } = useQuery<Overview>({
    queryKey: ["overview"],
    queryFn: () => fetch("/api/overview").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const { data: daily = [] } = useQuery<DayRow[]>({
    queryKey: ["daily", 14],
    queryFn: () => fetch("/api/daily?days=14").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const today = overview?.today;
  const latest = daily.at(-1);
  const previous = daily.at(-2);
  const sevenDays = daily.slice(-7);

  const totalTokensToday = (today?.input_tokens ?? 0) + (today?.output_tokens ?? 0);
  const activeSeconds = (today?.active_time_user_s ?? 0) + (today?.active_time_cli_s ?? 0);
  const costPerSession = (today?.sessions ?? 0) > 0 ? (today?.cost_usd ?? 0) / (today?.sessions ?? 1) : 0;
  const cacheHits = (today?.cache_read_tokens ?? 0) + (today?.cache_creation_tokens ?? 0) > 0
    ? (today?.cache_read_tokens ?? 0) /
      ((today?.input_tokens ?? 0) + (today?.cache_read_tokens ?? 0) + (today?.cache_creation_tokens ?? 0))
    : 0;

  const cards = [
    {
      label: "Cost today",
      value: fmtCurrency(today?.cost_usd ?? 0, 4),
      sub: `All-time ${fmtCurrency(overview?.alltime.cost_usd ?? 0, 2)}`,
      delta: `vs yesterday ${deltaLabel(today?.cost_usd ?? 0, previous?.cost_usd ?? 0, true)}`,
      trend: daily.map((d) => d.cost_usd),
      accent: "#f59e0b",
    },
    {
      label: "Tokens today",
      value: fmtCompact(totalTokensToday),
      sub: `${fmtCompact(today?.input_tokens ?? 0)} in · ${fmtCompact(today?.output_tokens ?? 0)} out`,
      delta: `vs yesterday ${deltaLabel(totalTokensToday, (previous?.input_tokens ?? 0) + (previous?.output_tokens ?? 0), true)}`,
      trend: daily.map((d) => d.input_tokens + d.output_tokens),
      accent: "#60a5fa",
    },
    {
      label: "Sessions today",
      value: fmtCompact(today?.sessions ?? 0),
      sub: `All-time ${fmtCompact(overview?.alltime.sessions ?? 0)}`,
      delta: `vs yesterday ${deltaLabel(today?.sessions ?? 0, previous?.sessions ?? 0, true)}`,
      trend: daily.map((d) => d.sessions),
      accent: "#34d399",
    },
    {
      label: "Active time",
      value: fmtDurationSeconds(activeSeconds),
      sub: `${fmtDurationSeconds(today?.active_time_user_s ?? 0)} typing · ${fmtDurationSeconds(today?.active_time_cli_s ?? 0)} CLI`,
      delta: "time on task, not idle",
      trend: daily.map((d) => d.active_time_user_s + d.active_time_cli_s),
      accent: "#c084fc",
    },
    {
      label: "Tool success",
      value: fmtPercent(today?.tool_success_rate ?? 0),
      sub: `${fmtCompact(today?.api_requests ?? 0)} API requests · ${fmtCompact(today?.api_errors ?? 0)} errors`,
      delta: `${fmtCompact(overview?.alltime.api_errors ?? 0)} total API errors`,
      trend: daily.map((d) => (d.api_requests > 0 ? (d.api_requests - d.api_errors) / d.api_requests : 0)),
      accent: "#22c55e",
    },
    {
      label: "Cache share",
      value: fmtPercent(cacheHits),
      sub: `${fmtCompact(today?.cache_read_tokens ?? 0)} cache reads · ${fmtCompact(today?.cache_creation_tokens ?? 0)} cache creates`,
      delta: `cost/session ${fmtCurrency(costPerSession, 4)}`,
      trend: daily.map((d) => {
        const total = d.input_tokens + d.cache_read_tokens + d.cache_creation_tokens;
        return total > 0 ? d.cache_read_tokens / total : 0;
      }),
      accent: "#38bdf8",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <StatCard key={card.label} {...card} />
      ))}

      <div className="sm:col-span-2 lg:col-span-3 xl:col-span-6 rounded-2xl border border-cyan-400/15 bg-gradient-to-r from-cyan-400/10 via-slate-950 to-amber-400/10 p-3 shadow-[0_20px_50px_rgba(2,6,23,0.22)] backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Signal summary</p>
            <h2 className="mt-1 text-base font-semibold text-slate-50">What the current telemetry says</h2>
          </div>
          <div className="ml-auto grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">7d avg cost</p>
              <p className="mt-1 text-xs font-semibold text-slate-100">
                {fmtCurrency(sevenDays.reduce((sum, d) => sum + d.cost_usd, 0) / Math.max(sevenDays.length, 1), 4)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">7d sessions</p>
              <p className="mt-1 text-xs font-semibold text-slate-100">
                {fmtCompact(sevenDays.reduce((sum, d) => sum + d.sessions, 0))}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">7d active time</p>
              <p className="mt-1 text-xs font-semibold text-slate-100">
                {fmtDurationSeconds(
                  sevenDays.reduce((sum, d) => sum + d.active_time_user_s + d.active_time_cli_s, 0),
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {fmtCompact(latest?.lines_of_code ?? 0)} lines changed today
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {fmtCompact(today?.commits ?? 0)} commits · {fmtCompact(today?.pull_requests ?? 0)} PRs
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {fmtCompact(today?.api_errors ?? 0)} API errors today
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
            {fmtCurrency(costPerSession, 4)} per session
          </span>
        </div>
      </div>
    </section>
  );
}
