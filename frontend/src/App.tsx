import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import OverviewCards from "./components/OverviewCards";
import DailyChart from "./components/DailyChart";
import ModelBreakdown from "./components/ModelBreakdown";
import ToolTable from "./components/ToolTable";
import EditDecisions from "./components/EditDecisions";
import LiveFeed from "./components/LiveFeed";
import SessionTable from "./components/SessionTable";
import ErrorPanel from "./components/ErrorPanel";

const qc = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <div className="min-h-screen bg-[#020617] text-slate-100">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute inset-x-0 top-[-14rem] h-[28rem] bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.22),transparent_55%)]" />
          <div className="absolute left-[-10rem] top-[20rem] h-[24rem] w-[24rem] rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute right-[-8rem] top-[32rem] h-[24rem] w-[24rem] rounded-full bg-amber-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.04)_1px,transparent_1px)] bg-[size:80px_80px] opacity-20" />
        </div>

        <header className="relative z-10 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-5 lg:px-6">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">cc-analytics</p>
              <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">
                Claude Code Intelligence Dashboard
              </h1>
            </div>
            <div className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 md:block">
              Operational telemetry, not just totals
            </div>
          </div>
        </header>

        <main className="relative z-10 mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-5 lg:px-6">
          <OverviewCards />

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_320px]">
            <DailyChart days={30} />
            <div className="xl:sticky xl:top-4">
              <LiveFeed />
            </div>
          </div>

          <ModelBreakdown />

          <div className="grid gap-4 xl:grid-cols-2">
            <ToolTable />
            <EditDecisions />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ErrorPanel />
            <SessionTable />
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
}
