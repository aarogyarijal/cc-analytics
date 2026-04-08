import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtCurrency } from "../lib/format";

type DailyRow = {
  date: string;
  cost_usd: number;
  lines_added: number;
  lines_removed: number;
  sessions: number;
};

type CellData = {
  date: string;
  cost: number;
  lines: number;
  sessions: number;
};

type Metric = "cost" | "lines" | "sessions";

const METRICS: Metric[] = ["cost", "lines", "sessions"];

const METRIC_CONFIG: Record<Metric, { label: string; color: [number, number, number] }> = {
  cost: { label: "Cost", color: [251, 146, 60] },
  lines: { label: "Lines", color: [52, 211, 153] },
  sessions: { label: "Sessions", color: [56, 189, 248] },
};

const DOW_HEADERS = ["S", "M", "T", "W", "T", "F", "S"];
const TOTAL_WEEKS = 4;

function getCellColor(value: number, max: number, rgb: [number, number, number]): string {
  if (value === 0 || max === 0) return "rgba(30, 41, 59, 0.5)";
  const ratio = Math.min(value / max, 1);
  const level = ratio < 0.25 ? 0.2 : ratio < 0.5 ? 0.35 : ratio < 0.75 ? 0.55 : 0.8;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${level})`;
}

function getValue(cell: CellData, metric: Metric): number {
  if (metric === "cost") return cell.cost;
  if (metric === "lines") return cell.lines;
  return cell.sessions;
}

function fmtValue(value: number, metric: Metric): string {
  if (metric === "cost") return fmtCurrency(value, 2);
  return String(Math.round(value));
}

/** Week label like "Mar 31" from the Monday of that week */
function weekLabel(cells: CellData[]): string {
  // Find first valid date in the week (Monday = index 1, or fallback to Sunday = 0)
  const first = cells.find((c) => c.date);
  if (!first) return "";
  const d = new Date(first.date + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ─── Single mini heatmap for one metric (weeks as rows) ─── */
function MiniGraph({
  metric,
  weeks,
  max,
}: {
  metric: Metric;
  weeks: CellData[][]; // [week][dow], 4 weeks × 7 days
  max: number;
}) {
  const [hovered, setHovered] = useState<CellData | null>(null);
  const cfg = METRIC_CONFIG[metric];

  return (
    <div className="flex-1 min-w-0">
      {/* Title + hover info */}
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: `rgb(${cfg.color.join(",")})` }}
        >
          {cfg.label}
        </span>
        <span className="text-[9px] text-slate-500 truncate ml-2">
          {hovered && hovered.date ? (
            <>
              {new Date(hovered.date + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              {" — "}
              <span style={{ color: `rgb(${cfg.color.join(",")})` }}>
                {fmtValue(getValue(hovered, metric), metric)}
              </span>
            </>
          ) : null}
        </span>
      </div>

      {/* Day-of-week header */}
      <div className="flex items-center" style={{ marginLeft: 36 }}>
        {DOW_HEADERS.map((d, i) => (
          <span
            key={i}
            className="text-[8px] text-slate-600 text-center"
            style={{ width: 13 }}
          >
            {d}
          </span>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => (
        <div key={wi} className="flex items-center" style={{ height: 15 }}>
          <span className="text-[8px] text-slate-600 text-right pr-1 flex-shrink-0" style={{ width: 36 }}>
            {weekLabel(week)}
          </span>
          {week.map((cell, di) => {
            if (!cell.date) {
              return <span key={di} className="inline-block" style={{ width: 11, height: 11, margin: 1 }} />;
            }
            const val = getValue(cell, metric);
            return (
              <span
                key={di}
                className="inline-block rounded-sm transition-colors"
                style={{
                  width: 11,
                  height: 11,
                  margin: 1,
                  backgroundColor: getCellColor(val, max, cfg.color),
                }}
                onMouseEnter={() => setHovered(cell)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* ─── Main: 3 compact side-by-side graphs, 4 week-rows each ─── */
export default function DowHeatmap() {
  const { data: daily = [] } = useQuery<DailyRow[]>({
    queryKey: ["daily", 30],
    queryFn: () => fetch("/api/daily?days=30").then((r) => r.json()),
    refetchInterval: 120_000,
  });

  const { weeks, maxByMetric } = useMemo(() => {
    const byDate = new Map<string, DailyRow>();
    for (const row of daily) byDate.set(row.date, row);

    const today = new Date();
    const todayDow = today.getDay(); // 0=Sun
    // Start from the Sunday 4 weeks ago
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - (TOTAL_WEEKS * 7) + (7 - todayDow));

    const result: CellData[][] = [];

    for (let w = 0; w < TOTAL_WEEKS; w++) {
      const week: CellData[] = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(startDate.getDate() + w * 7 + d);

        if (cellDate > today) {
          week.push({ date: "", cost: 0, lines: 0, sessions: 0 });
          continue;
        }

        const dateStr = cellDate.toISOString().slice(0, 10);
        const row = byDate.get(dateStr);
        week.push({
          date: dateStr,
          cost: row?.cost_usd ?? 0,
          lines: (row?.lines_added ?? 0) + (row?.lines_removed ?? 0),
          sessions: row?.sessions ?? 0,
        });
      }
      result.push(week);
    }

    const maxes: Record<Metric, number> = { cost: 0, lines: 0, sessions: 0 };
    for (const week of result) {
      for (const cell of week) {
        if (cell.cost > maxes.cost) maxes.cost = cell.cost;
        if (cell.lines > maxes.lines) maxes.lines = cell.lines;
        if (cell.sessions > maxes.sessions) maxes.sessions = cell.sessions;
      }
    }

    return { weeks: result, maxByMetric: maxes };
  }, [daily]);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 px-4 py-3 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Activity</p>
          <span className="text-[10px] text-slate-600">Last 4 weeks</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {METRICS.map((m) => (
          <MiniGraph key={m} metric={m} weeks={weeks} max={maxByMetric[m]} />
        ))}
      </div>
    </section>
  );
}
