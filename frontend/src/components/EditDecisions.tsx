import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { fmtCompact, fmtPercent } from "../lib/format";

type DecisionRow = {
  tool: string;
  language: string;
  decision: "accept" | "reject";
  count: number;
};

export default function EditDecisions() {
  const { data = [] } = useQuery<DecisionRow[]>({
    queryKey: ["decisions"],
    queryFn: () => fetch("/api/decisions").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const byTool: Record<string, { accept: number; reject: number }> = {};
  const byLanguage: Record<string, { accept: number; reject: number }> = {};

  for (const row of data) {
    if (row.tool) {
      byTool[row.tool] ??= { accept: 0, reject: 0 };
      byTool[row.tool][row.decision] += row.count;
    }
    const language = row.language || "unknown";
    byLanguage[language] ??= { accept: 0, reject: 0 };
    byLanguage[language][row.decision] += row.count;
  }

  const toolData = Object.entries(byTool)
    .map(([tool, v]) => ({
      tool: tool.replace("_tool", ""),
      accept: v.accept,
      reject: v.reject,
      rate: v.accept + v.reject > 0 ? v.accept / (v.accept + v.reject) : 0,
    }))
    .sort((a, b) => b.accept + b.reject - (a.accept + a.reject));

  const languageData = Object.entries(byLanguage)
    .map(([language, v]) => ({
      language,
      accept: v.accept,
      reject: v.reject,
      rate: v.accept + v.reject > 0 ? v.accept / (v.accept + v.reject) : 0,
      total: v.accept + v.reject,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const totalAccept = toolData.reduce((sum, row) => sum + row.accept, 0);
  const totalReject = toolData.reduce((sum, row) => sum + row.reject, 0);
  const overallRate = totalAccept + totalReject > 0 ? totalAccept / (totalAccept + totalReject) : 0;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/85 p-4 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Edit behavior</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Where users accept, reject, or hesitate</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            {fmtPercent(overallRate)} accepted overall
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300">
            {fmtCompact(totalAccept + totalReject)} decisions
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <h3 className="mb-2 text-sm font-semibold text-slate-100">By tool</h3>
          {toolData.length === 0 ? (
            <p className="py-6 text-center text-slate-500">No edit decisions yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={toolData} layout="vertical" margin={{ left: 8, right: 16, top: 6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.18)" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis dataKey="tool" type="category" tick={{ fontSize: 11, fill: "#cbd5e1" }} width={70} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(2, 6, 23, 0.95)",
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: "12px",
                    color: "#e2e8f0",
                  }}
                  formatter={(value, name) => [fmtCompact(Number(value ?? 0)), String(name)]}
                />
                <Legend wrapperStyle={{ color: "#cbd5e1" }} />
                <Bar dataKey="accept" stackId="a" fill="#10b981" name="Accepted" radius={[0, 0, 0, 0]} />
                <Bar dataKey="reject" stackId="a" fill="#ef4444" name="Rejected" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5">
          <h3 className="mb-2 text-sm font-semibold text-slate-100">By language</h3>
          <div className="space-y-2">
            {languageData.map((row) => (
              <div key={row.language} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-100">{row.language}</p>
                    <p className="text-xs text-slate-400">{fmtCompact(row.total)} decisions</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-300">{fmtPercent(row.rate)}</p>
                    <p className="text-xs text-slate-400">
                      {fmtCompact(row.accept)} accept · {fmtCompact(row.reject)} reject
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-emerald-400" style={{ width: `${row.rate * 100}%` }} />
                </div>
              </div>
            ))}
            {languageData.length === 0 && <p className="py-6 text-center text-slate-500">No language data yet</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
