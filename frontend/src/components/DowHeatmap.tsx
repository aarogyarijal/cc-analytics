import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fmtCurrency, fmtCompact } from "../lib/format";

type DowPattern = {
  dow: number;
  day_name: string;
  day_count: number;
  avg_cost_usd: number;
  avg_lines: number;
  avg_commits: number;
  avg_api_requests: number;
};

/**
 * Interpolate a color based on value and max.
 * Returns a Tailwind-style hex color or rgba value.
 */
function getCostColor(value: number, max: number): string {
  if (max === 0) return "rgba(15, 23, 42, 0.5)";
  const ratio = value / max;
  // Interpolate from dark (low) to amber-500/40 (high)
  const r = Math.round(251 * ratio);
  const g = Math.round(146 * ratio);
  const b = Math.round(11 * (1 - ratio * 0.5));
  const alpha = 0.2 + ratio * 0.3;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getLinesColor(value: number, max: number): string {
  if (max === 0) return "rgba(15, 23, 42, 0.5)";
  const ratio = value / max;
  // Interpolate from dark (low) to emerald-500/40 (high)
  const r = Math.round(34 * ratio);
  const g = Math.round(197 * ratio);
  const b = Math.round(94 * ratio);
  const alpha = 0.2 + ratio * 0.3;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function DowHeatmap() {
  const { data: patterns = [] } = useQuery<DowPattern[]>({
    queryKey: ["patterns"],
    queryFn: () => fetch("/api/patterns").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const maxCost = Math.max(...patterns.map((p) => p.avg_cost_usd), 1);
  const maxLines = Math.max(...patterns.map((p) => p.avg_lines), 1);

  const [hoveredCell, setHoveredCell] = useState<{ dow: number; metric: string } | null>(null);

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div>
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Patterns</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-50">Day of Week</h2>
      </div>

      <div className="mt-4 space-y-4">
        {/* Cost heatmap */}
        <div>
          <p className="mb-2 text-xs font-semibold text-amber-300">Average Daily Cost</p>
          <div className="flex gap-1">
            {patterns.map((p) => (
              <div
                key={`cost-${p.dow}`}
                className="relative flex-1"
                onMouseEnter={() => setHoveredCell({ dow: p.dow, metric: "cost" })}
                onMouseLeave={() => setHoveredCell(null)}
              >
                <div
                  className="h-16 rounded-lg border border-white/10 transition-all"
                  style={{ backgroundColor: getCostColor(p.avg_cost_usd, maxCost) }}
                >
                  {hoveredCell?.dow === p.dow && hoveredCell?.metric === "cost" && (
                    <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-slate-100 shadow-lg">
                      {p.day_name}: {fmtCurrency(p.avg_cost_usd, 4)}
                    </div>
                  )}
                </div>
                <p className="mt-1 text-center text-[10px] font-medium text-slate-400">{p.day_name.slice(0, 3)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Lines heatmap */}
        <div>
          <p className="mb-2 text-xs font-semibold text-emerald-300">Average Daily Lines Changed</p>
          <div className="flex gap-1">
            {patterns.map((p) => (
              <div
                key={`lines-${p.dow}`}
                className="relative flex-1"
                onMouseEnter={() => setHoveredCell({ dow: p.dow, metric: "lines" })}
                onMouseLeave={() => setHoveredCell(null)}
              >
                <div
                  className="h-16 rounded-lg border border-white/10 transition-all"
                  style={{ backgroundColor: getLinesColor(p.avg_lines, maxLines) }}
                >
                  {hoveredCell?.dow === p.dow && hoveredCell?.metric === "lines" && (
                    <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-slate-100 shadow-lg">
                      {p.day_name}: {fmtCompact(p.avg_lines)} lines
                    </div>
                  )}
                </div>
                <p className="mt-1 text-center text-[10px] font-medium text-slate-400">{p.day_name.slice(0, 3)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Summary stats */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
          <p className="mb-2 font-semibold text-slate-100">Weekly Summary</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-slate-500">Most expensive day</p>
              <p className="font-semibold text-amber-300">
                {patterns.reduce((max, p) => (p.avg_cost_usd > max.avg_cost_usd ? p : max), patterns[0] || {})
                  ?.day_name || "—"}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Most productive day</p>
              <p className="font-semibold text-emerald-300">
                {patterns.reduce((max, p) => (p.avg_lines > max.avg_lines ? p : max), patterns[0] || {})
                  ?.day_name || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
