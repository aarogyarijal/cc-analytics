import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardProvider, useDashboard } from "./lib/DashboardContext";
import OverviewCards from "./components/OverviewCards";
import DailyChart from "./components/DailyChart";
import InsightsRow from "./components/InsightsRow";
import ModelBreakdown from "./components/ModelBreakdown";
import ToolTable from "./components/ToolTable";
import EditDecisions from "./components/EditDecisions";
import LiveFeed from "./components/LiveFeed";
import SessionTable from "./components/SessionTable";
import ErrorPanel from "./components/ErrorPanel";
import EnvironmentalImpact from "./components/EnvironmentalImpact";

const qc = new QueryClient();

const PERIODS = [
  { key: "today" as const, label: "Today" },
  { key: "week" as const, label: "Week" },
  { key: "month" as const, label: "Month" },
];

function DashboardToolbar() {
  const { period, setPeriod, intervalIdx, setIntervalIdx, intervals } = useDashboard();

  return (
    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-md">
      {PERIODS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setPeriod(key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            period === key
              ? "bg-white/10 text-slate-50"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-300"
          }`}
        >
          {label}
        </button>
      ))}
      <div className="mx-1.5 h-4 w-px bg-white/10" />
      {intervals.map((opt, i) => (
        <button
          key={opt.label}
          onClick={() => setIntervalIdx(i)}
          className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium tabular-nums transition-colors ${
            intervalIdx === i
              ? "bg-white/10 text-slate-50"
              : "text-slate-400 hover:bg-white/5 hover:text-slate-300"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Dashboard() {
  return (
    <div className="min-h-screen bg-[#020617] text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-[-14rem] h-[28rem] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_55%)]" />
        <div className="absolute left-[-10rem] top-[20rem] h-[24rem] w-[24rem] rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-[-8rem] top-[32rem] h-[24rem] w-[24rem] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:80px_80px] opacity-20" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-5 lg:px-6">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="" className="h-7 w-7 opacity-90" />
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Aarogya Rijal</p>
              <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">Claude Code Analytics</h1>
            </div>
          </div>
          <DashboardToolbar />
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-5 lg:px-6">
        <OverviewCards />

        <div id="section-usage" className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_320px]">
          <DailyChart />
          <div className="xl:sticky xl:top-4">
            <LiveFeed />
          </div>
        </div>

        <div id="section-sessions">
          <InsightsRow />
        </div>

        <div id="section-environmental">
          <EnvironmentalImpact />
        </div>

        <div id="section-models">
          <ModelBreakdown />
        </div>

        <div id="section-tools" className="grid gap-4 xl:grid-cols-2">
          <ToolTable />
          <EditDecisions />
        </div>

        <div id="section-errors" className="grid gap-4 xl:grid-cols-2">
          <ErrorPanel />
          <SessionTable />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <DashboardProvider>
        <Dashboard />
      </DashboardProvider>
    </QueryClientProvider>
  );
}
