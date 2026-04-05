import { useQuery } from "@tanstack/react-query";
import { fmtCompact, fmtDurationMs, shortId } from "../lib/format";

type ErrorRow = {
  model: string;
  status_code: string;
  count: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  first_seen_ts: number;
  last_seen_ts: number;
  max_attempt: number;
};

function timeAgo(ts: number) {
  const delta = Date.now() - ts;
  if (delta < 60_000) return `${Math.max(1, Math.round(delta / 1000))}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}

export default function ErrorPanel() {
  const { data = [] } = useQuery<ErrorRow[]>({
    queryKey: ["errors"],
    queryFn: () => fetch("/api/errors").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const total = data.reduce((sum, row) => sum + row.count, 0);
  const worst = data[0];

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">API errors</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Failure hotspots and retry pressure</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            {fmtCompact(total)} total errors
          </span>
          {worst && (
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
              Worst {shortId(worst.model || "unknown", 10, 4)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        <table className="w-full text-xs">
          <thead className="bg-black/20">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-400">Model</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Status</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Count</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Avg</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Max</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Attempts</th>
              <th className="px-4 py-3 text-right font-medium text-slate-400">Seen</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={`${row.model}-${row.status_code}`} className="border-t border-white/10 hover:bg-white/5">
                <td className="px-3 py-2.5 text-slate-100">{shortId(row.model || "unknown", 12, 6)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{row.status_code}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-rose-300">{fmtCompact(row.count)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtDurationMs(row.avg_duration_ms)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmtDurationMs(row.max_duration_ms)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-200">{fmtCompact(row.max_attempt)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{timeAgo(row.last_seen_ts)}</td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No API errors captured yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
