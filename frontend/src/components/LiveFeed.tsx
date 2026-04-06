import { useEffect, useRef } from "react";
import { useLiveFeed, type LiveEvent } from "../hooks/useLiveFeed";
import { fmtCompact, fmtCurrency, fmtDurationMs, shortId } from "../lib/format";

const EVENT_META: Record<string, { dot: string; bg: string; border: string; label: string; accent: string }> = {
  api_request: { dot: "bg-cyan-400",    bg: "bg-cyan-400/8",    border: "border-cyan-400/20",    label: "API",      accent: "text-cyan-300" },
  tool_result: { dot: "bg-sky-400",     bg: "bg-sky-400/8",     border: "border-sky-400/20",     label: "Tool",     accent: "text-sky-300" },
  user_prompt: { dot: "bg-amber-400",   bg: "bg-amber-400/8",   border: "border-amber-400/20",   label: "Prompt",   accent: "text-amber-300" },
  tool_decision:{ dot: "bg-fuchsia-400",bg: "bg-fuchsia-400/8", border: "border-fuchsia-400/20", label: "Decision", accent: "text-fuchsia-300" },
  api_error:   { dot: "bg-rose-400",    bg: "bg-rose-400/8",    border: "border-rose-400/20",    label: "Error",    accent: "text-rose-300" },
  metric:      { dot: "bg-slate-400",   bg: "bg-slate-400/8",   border: "border-slate-400/20",   label: "Metric",   accent: "text-slate-400" },
};

function timeStr(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortModel(model: string) {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function primaryLine(ev: LiveEvent): string {
  const a = ev.attrs ?? {};
  switch (ev.type) {
    case "api_request": {
      const model = shortModel(String(a.model ?? "?"));
      const dur = a.duration_ms != null ? fmtDurationMs(Number(a.duration_ms)) : "";
      return [model, dur].filter(Boolean).join("  ·  ");
    }
    case "tool_result": {
      const tool = String(a.tool_name ?? "unknown");
      const ok = a.success === "true";
      const dur = a.duration_ms != null ? fmtDurationMs(Number(a.duration_ms)) : "";
      return `${ok ? "✓" : "✗"} ${tool}  ·  ${dur}`;
    }
    case "user_prompt":
      return `length ${a.prompt_length ?? "?"}`;
    case "tool_decision":
      return `${a.decision ?? "?"}  ·  ${a.tool_name ?? ""}`;
    case "api_error": {
      const model = shortModel(String(a.model ?? "?"));
      const code = a.status_code ?? "?";
      return `${model}  ·  HTTP ${code}`;
    }
    case "metric":
      return `${String(ev.name ?? "").replace("claude_code.", "")}  +${fmtCompact(Number(ev.value ?? 0))}`;
    default:
      return JSON.stringify(a).slice(0, 80);
  }
}

function detailLine(ev: LiveEvent): string | null {
  const a = ev.attrs ?? {};
  switch (ev.type) {
    case "api_request": {
      const parts: string[] = [];
      if (a["session.id"]) parts.push(`session ${shortId(String(a["session.id"]))}`);
      if (a.input_tokens != null)
        parts.push(`${fmtCompact(Number(a.input_tokens))} in / ${fmtCompact(Number(a.output_tokens ?? 0))} out`);
      if (a.cost_usd != null) parts.push(fmtCurrency(Number(a.cost_usd), 5));
      if (a["prompt.id"]) parts.push(`prompt ${shortId(String(a["prompt.id"]))}`);
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "tool_result": {
      const parts: string[] = [];
      if (a["session.id"]) parts.push(`session ${shortId(String(a["session.id"]))}`);
      if (a.success !== "true" && a.error) parts.push(String(a.error).slice(0, 60));
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "user_prompt": {
      const parts: string[] = [];
      if (a["session.id"]) parts.push(`session ${shortId(String(a["session.id"]))}`);
      if (a["prompt.id"]) parts.push(`prompt ${shortId(String(a["prompt.id"]))}`);
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "api_error": {
      const parts: string[] = [];
      if (a.attempt != null && Number(a.attempt) > 1) parts.push(`attempt ${a.attempt}`);
      if (a.duration_ms != null) parts.push(fmtDurationMs(Number(a.duration_ms)));
      if (a.error) parts.push(String(a.error).slice(0, 60));
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "metric": {
      // Only show useful labels — skip noisy resource attrs (user.id, org.id, email, etc.)
      const SKIP = new Set(["session.id", "user.id", "organization.id", "user.email", "user.name"]);
      const labels = ev.labels ?? {};
      const parts: string[] = [];
      if (labels["session.id"]) parts.push(`session ${shortId(labels["session.id"])}`);
      for (const [k, v] of Object.entries(labels)) {
        if (!SKIP.has(k)) parts.push(`${k}=${v}`);
      }
      return parts.length ? parts.join("  ·  ") : null;
    }
    default:
      return null;
  }
}

function EventRow({ ev }: { ev: LiveEvent }) {
  const meta = EVENT_META[ev.type] ?? {
    dot: "bg-slate-500", bg: "bg-slate-500/8", border: "border-slate-500/20",
    label: ev.type, accent: "text-slate-300",
  };
  const primary = primaryLine(ev);
  const detail = detailLine(ev);
  const isError = ev.type === "api_error" || (ev.type === "tool_result" && ev.attrs?.success === "false");

  return (
    <div className={`min-w-0 overflow-hidden rounded-lg border ${meta.border} ${meta.bg} px-2.5 py-1.5 text-[11px] ${isError ? "ring-1 ring-rose-500/30" : ""}`}>
      {/* Fixed metadata | flex content — two-column layout keeps both lines width-capped */}
      <div className="flex min-w-0 items-start gap-2">
        {/* Left: fixed-width metadata column */}
        <div className="flex flex-shrink-0 items-center gap-1.5 pt-px">
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          <span className="tabular-nums text-slate-500">{timeStr(ev.receivedAt)}</span>
          <span className={`w-[52px] text-right font-semibold uppercase tracking-wide text-[9px] ${meta.accent}`}>{meta.label}</span>
        </div>
        {/* Right: content column, min-w-0 ensures truncation works */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-slate-200">{primary}</p>
          {detail && (
            <p className="truncate font-mono text-[10px] text-slate-500">{detail}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LiveFeed() {
  const { events, connected } = useLiveFeed();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Auto-scroll to bottom only if already pinned there
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events]);

  function onScroll() {
    const el = containerRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  return (
    <aside className="w-full overflow-hidden flex flex-col rounded-2xl border border-white/10 bg-slate-950/85 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md" style={{ height: "100%", minHeight: 420, maxHeight: 720 }}>
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2.5 flex-shrink-0">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Live</p>
          <h2 className="mt-1 text-sm font-semibold text-slate-50">Feed</h2>
        </div>
        <div className="flex items-center gap-3">
          {events.length > 0 && (
            <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-slate-400">
              {events.length}
            </span>
          )}
          <span className={`flex items-center gap-1.5 text-xs ${connected ? "text-emerald-300" : "text-slate-500"}`}>
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            {connected ? "Live" : "Reconnecting"}
          </span>
        </div>
      </div>

      <div
        ref={containerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 min-h-0"
      >
        {events.length === 0 ? (
          <div className="flex h-full min-h-[360px] items-center justify-center">
            <p className="text-xs text-slate-500">Waiting for events…</p>
          </div>
        ) : (
          <>
            {[...events].reverse().map((ev, i) => <EventRow key={i} ev={ev} />)}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </aside>
  );
}
