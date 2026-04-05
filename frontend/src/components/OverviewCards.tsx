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
};

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
}: {
  label: string;
  value: string;
  sub: string;
  delta: string;
}) {
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
  const previous = daily.at(-2);

  const totalTokensToday = (today?.input_tokens ?? 0) + (today?.output_tokens ?? 0);
  const activeSeconds = (today?.active_time_user_s ?? 0) + (today?.active_time_cli_s ?? 0);
  const cacheHits = (today?.cache_read_tokens ?? 0) + (today?.cache_creation_tokens ?? 0) > 0
    ? (today?.cache_read_tokens ?? 0) /
      ((today?.input_tokens ?? 0) + (today?.cache_read_tokens ?? 0) + (today?.cache_creation_tokens ?? 0))
    : 0;

  // Efficiency metrics for 2nd row
  const linesChanged = (today?.lines_added ?? 0) + (today?.lines_removed ?? 0);
  const costPerLine = linesChanged > 0 ? (today?.cost_usd ?? 0) / linesChanged : 0;
  const costPerCommit = (today?.commits ?? 0) > 0 ? (today?.cost_usd ?? 0) / (today?.commits ?? 0) : 0;
  const burnRate = (today?.active_time_user_s ?? 0) + (today?.active_time_cli_s ?? 0) > 0
    ? ((today?.cost_usd ?? 0) / ((today?.active_time_user_s ?? 0) + (today?.active_time_cli_s ?? 0))) * 3600
    : 0;
  const cacheSavingsPercent = (today?.cost_usd ?? 0) > 0
    ? ((today?.cache_savings_usd ?? 0) / (today?.cost_usd ?? 0)) * 100
    : 0;

  const cards = [
    {
      label: "Cost",
      value: fmtCurrency(today?.cost_usd ?? 0, 4),
      sub: `all ${fmtCurrency(overview?.alltime.cost_usd ?? 0, 2)}`,
      delta: deltaLabel(today?.cost_usd ?? 0, previous?.cost_usd ?? 0, true),
    },
    {
      label: "Tokens",
      value: fmtCompact(totalTokensToday),
      sub: `${fmtCompact(today?.input_tokens ?? 0)} in · ${fmtCompact(today?.output_tokens ?? 0)} out`,
      delta: deltaLabel(totalTokensToday, (previous?.input_tokens ?? 0) + (previous?.output_tokens ?? 0), true),
    },
    {
      label: "Lines",
      value: fmtCompact((today?.lines_added ?? 0) + (today?.lines_removed ?? 0)),
      sub: `${fmtCompact(today?.lines_added ?? 0)} added · ${fmtCompact(today?.lines_removed ?? 0)} removed`,
      delta: deltaLabel((today?.lines_added ?? 0) + (today?.lines_removed ?? 0), (previous?.lines_of_code ?? 0), true),
    },
    {
      label: "Time",
      value: fmtDurationSeconds(activeSeconds),
      sub: `${fmtDurationSeconds(today?.active_time_user_s ?? 0)} typing · ${fmtDurationSeconds(today?.active_time_cli_s ?? 0)} CLI`,
      delta: "active",
    },
    {
      label: "Success",
      value: fmtPercent(today?.tool_success_rate ?? 0),
      sub: `${fmtCompact(today?.api_requests ?? 0)} req · ${fmtCompact(today?.api_errors ?? 0)} err`,
      delta: `${fmtCompact(overview?.alltime.api_errors ?? 0)} err`,
    },
    {
      label: "Cache",
      value: fmtPercent(cacheHits),
      sub: `${fmtCompact(today?.cache_read_tokens ?? 0)} read · ${fmtCompact(today?.cache_creation_tokens ?? 0)} create`,
      delta: "cache",
    },
  ];

  const efficiencyCards = [
    {
      label: "Cost / Commit",
      value: fmtCurrency(costPerCommit, 4),
      sub: `${fmtCompact(today?.commits ?? 0)} commits`,
      delta: deltaLabel(costPerCommit, costPerCommit === 0 ? 0 : costPerCommit * 0.95, true),
    },
    {
      label: "Cost / Line",
      value: fmtCurrency(costPerLine, 4),
      sub: `${fmtCompact(linesChanged)} lines`,
      delta: deltaLabel(costPerLine, costPerLine === 0 ? 0 : costPerLine * 0.95, true),
    },
    {
      label: "Cache Savings",
      value: fmtCurrency(today?.cache_savings_usd ?? 0, 4),
      sub: `${fmtCompact(cacheSavingsPercent)}% of cost`,
      delta: `saved today`,
    },
    {
      label: "Burn Rate",
      value: fmtCurrency(burnRate, 2) + "/hr",
      sub: `${fmtDurationSeconds((today?.active_time_user_s ?? 0) + (today?.active_time_cli_s ?? 0))} active`,
      delta: "hourly",
    },
  ];

  return (
    <section className="space-y-2">
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
