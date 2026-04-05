import { useLiveFeed, type LiveEvent } from "../hooks/useLiveFeed";
import { fmtCompact, fmtCurrency, fmtDurationMs } from "../lib/format";

const EVENT_STYLES: Record<string, { dot: string; bg: string; label: string; accent: string }> = {
  api_request: { dot: "bg-cyan-400", bg: "bg-cyan-400/10", label: "API", accent: "text-cyan-300" },
  tool_result: { dot: "bg-sky-400", bg: "bg-sky-400/10", label: "Tool", accent: "text-sky-300" },
  user_prompt: { dot: "bg-amber-400", bg: "bg-amber-400/10", label: "Prompt", accent: "text-amber-300" },
  tool_decision: { dot: "bg-fuchsia-400", bg: "bg-fuchsia-400/10", label: "Decision", accent: "text-fuchsia-300" },
  api_error: { dot: "bg-rose-400", bg: "bg-rose-400/10", label: "Error", accent: "text-rose-300" },
  metric: { dot: "bg-slate-400", bg: "bg-slate-400/10", label: "Metric", accent: "text-slate-300" },
};

function eventSummary(ev: LiveEvent): string {
  const a = ev.attrs ?? {};
  switch (ev.type) {
    case "api_request": {
      const model = String(a.model ?? "").replace("claude-", "");
      const cost = a.cost_usd != null ? ` ${fmtCurrency(Number(a.cost_usd), 5)}` : "";
      const tokens =
        a.input_tokens != null
          ? ` ${fmtCompact(Number(a.input_tokens))} in / ${fmtCompact(Number(a.output_tokens ?? 0))} out`
          : "";
      const dur = a.duration_ms != null ? ` ${fmtDurationMs(Number(a.duration_ms))}` : "";
      return `${model}${tokens}${cost}${dur}`;
    }
    case "tool_result": {
      const tool = String(a.tool_name ?? "unknown");
      const ok = a.success === "true" ? "ok" : "fail";
      const dur = a.duration_ms != null ? ` ${fmtDurationMs(Number(a.duration_ms))}` : "";
      return `${ok} ${tool}${dur}`;
    }
    case "user_prompt":
      return `prompt length ${a.prompt_length ?? "?"}`;
    case "tool_decision":
      return `${a.decision ?? "?"} ${a.tool_name ?? ""}`;
    case "api_error":
      return `${a.model ?? ""} ${a.status_code ?? ""} ${String(a.error ?? "").slice(0, 72)}`;
    case "metric":
      return `${ev.name ?? ""} +${fmtCompact(Number(ev.value ?? 0))}`;
    default:
      return JSON.stringify(a).slice(0, 80);
  }
}

function timeStr(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function EventRow({ ev }: { ev: LiveEvent }) {
  const style = EVENT_STYLES[ev.type] ?? { dot: "bg-slate-500", bg: "bg-slate-500/10", label: ev.type, accent: "text-slate-300" };
  return (
    <div className={`rounded-xl border border-white/10 ${style.bg} px-3 py-2 text-xs`}>
      <div className="flex items-start gap-2">
        <span className={`mt-1 flex h-2 w-2 flex-shrink-0 rounded-full ${style.dot}`} />
        <span className="flex-shrink-0 w-16 tabular-nums text-slate-400">{timeStr(ev.receivedAt)}</span>
        <span className={`flex-shrink-0 w-16 font-medium ${style.accent}`}>{style.label}</span>
        <span className="min-w-0 flex-1 break-all font-mono text-slate-200">{eventSummary(ev)}</span>
      </div>
    </div>
  );
}

export default function LiveFeed() {
  const { events, connected } = useLiveFeed();

  return (
    <aside className="flex h-full min-h-[420px] flex-col rounded-2xl border border-white/10 bg-slate-950/85 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Live console</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-50">Streaming diagnostic feed</h2>
        </div>
        <span className={`flex items-center gap-1.5 text-xs ${connected ? "text-emerald-300" : "text-slate-500"}`}>
          <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
          {connected ? "Connected" : "Reconnecting"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {events.length === 0 ? (
          <div className="flex h-full min-h-[360px] items-center justify-center text-center">
            <p className="text-xs text-slate-500">
              Waiting for events
              <br />
              <span className="text-slate-600">Start Claude Code to stream requests, tools, and errors</span>
            </p>
          </div>
        ) : (
          events.map((ev, i) => <EventRow key={i} ev={ev} />)
        )}
      </div>
    </aside>
  );
}
