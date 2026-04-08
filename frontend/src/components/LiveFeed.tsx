import { useState } from "react";
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

type FilterType = "all" | "api_request" | "tool_result" | "api_error" | "user_prompt";

const FILTERS: { key: FilterType; label: string }[] = [
  { key: "all", label: "All" },
  { key: "api_request", label: "API" },
  { key: "tool_result", label: "Tool" },
  { key: "api_error", label: "Err" },
  { key: "user_prompt", label: "Prompt" },
];

function timeStr(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function shortModel(model: string) {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function toolInputSummary(toolInputRaw: unknown): string | null {
  if (!toolInputRaw) return null;
  try {
    const obj = JSON.parse(String(toolInputRaw));
    const val =
      obj.command ?? obj.file_path ?? obj.pattern ?? obj.path ?? obj.url ?? obj.query ?? null;
    if (val == null) return null;
    const s = String(val).replace(/^\/Users\/[^/]+\//, "~/");
    return s.length > 60 ? "…" + s.slice(-57) : s;
  } catch {
    return null;
  }
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
      const dur = a.duration_ms != null ? ` · ${fmtDurationMs(Number(a.duration_ms))}` : "";
      return `${ok ? "✓" : "✗"} ${tool}${dur}`;
    }
    case "user_prompt":
      return `new prompt · ${a.prompt_length ?? "?"} chars`;
    case "tool_decision": {
      const src = a.source === "config" ? "auto" : "manual";
      return `${a.decision ?? "?"}  ·  ${a.tool_name ?? ""}  ·  ${src}`;
    }
    case "api_error": {
      const model = shortModel(String(a.model ?? "?"));
      const code = a.status_code ?? "?";
      const dur = a.duration_ms != null ? `  · ${fmtDurationMs(Number(a.duration_ms))}` : "";
      return `${model}  ·  HTTP ${code}${dur}`;
    }
    case "metric": {
      const name = String(ev.name ?? "").replace("claude_code.", "");
      const labels = ev.labels ?? {};
      const type = labels.type ?? "";
      const model = labels.model ? shortModel(labels.model) : "";
      const suffix = [type, model].filter(Boolean).join(" ");
      return `${name}  +${fmtCompact(Number(ev.value ?? 0))}${suffix ? `  ·  ${suffix}` : ""}`;
    }
    default:
      return String(ev.type);
  }
}

function detailLine(ev: LiveEvent): string | null {
  const a = ev.attrs ?? {};
  switch (ev.type) {
    case "api_request": {
      const parts: string[] = [];
      if (a["session.id"]) parts.push(`s:${shortId(String(a["session.id"]))}`);
      if (a.input_tokens != null)
        parts.push(`${fmtCompact(Number(a.input_tokens))}in/${fmtCompact(Number(a.output_tokens ?? 0))}out`);
      if (a.cost_usd != null) parts.push(fmtCurrency(Number(a.cost_usd), 5));
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "tool_result": {
      const input = toolInputSummary(a.tool_input);
      if (input) return input;
      if (a["session.id"]) return `s:${shortId(String(a["session.id"]))}`;
      return null;
    }
    case "user_prompt": {
      const parts: string[] = [];
      if (a["session.id"]) parts.push(`s:${shortId(String(a["session.id"]))}`);
      if (a["prompt.id"]) parts.push(`p:${shortId(String(a["prompt.id"]))}`);
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "api_error": {
      const parts: string[] = [];
      if (a.attempt != null && Number(a.attempt) > 1) parts.push(`attempt ${a.attempt}`);
      if (a.error) parts.push(String(a.error).slice(0, 55));
      return parts.length ? parts.join("  ·  ") : null;
    }
    case "metric": {
      const labels = ev.labels ?? {};
      if (labels["session.id"]) return `s:${shortId(labels["session.id"])}`;
      return null;
    }
    default:
      return null;
  }
}

/** Full detail for expanded view */
function expandedDetail(ev: LiveEvent): Record<string, string> | null {
  const a = ev.attrs ?? {};
  const out: Record<string, string> = {};
  switch (ev.type) {
    case "api_request":
      if (a.model) out["Model"] = String(a.model);
      if (a.duration_ms != null) out["Duration"] = fmtDurationMs(Number(a.duration_ms));
      if (a.input_tokens != null) out["Input"] = fmtCompact(Number(a.input_tokens));
      if (a.output_tokens != null) out["Output"] = fmtCompact(Number(a.output_tokens));
      if (a.cost_usd != null) out["Cost"] = fmtCurrency(Number(a.cost_usd), 5);
      if (a["session.id"]) out["Session"] = String(a["session.id"]);
      if (a["prompt.id"]) out["Prompt"] = String(a["prompt.id"]);
      break;
    case "tool_result":
      if (a.tool_name) out["Tool"] = String(a.tool_name);
      out["Success"] = a.success === "true" ? "Yes" : "No";
      if (a.duration_ms != null) out["Duration"] = fmtDurationMs(Number(a.duration_ms));
      if (a.tool_input) {
        const full = String(a.tool_input);
        out["Input"] = full.length > 300 ? full.slice(0, 300) + "…" : full;
      }
      if (a["session.id"]) out["Session"] = String(a["session.id"]);
      break;
    case "api_error":
      if (a.model) out["Model"] = String(a.model);
      if (a.status_code) out["Status"] = String(a.status_code);
      if (a.duration_ms != null) out["Duration"] = fmtDurationMs(Number(a.duration_ms));
      if (a.attempt) out["Attempt"] = String(a.attempt);
      if (a.error) out["Error"] = String(a.error);
      if (a["session.id"]) out["Session"] = String(a["session.id"]);
      break;
    case "user_prompt":
      if (a.prompt_length) out["Length"] = `${a.prompt_length} chars`;
      if (a["session.id"]) out["Session"] = String(a["session.id"]);
      if (a["prompt.id"]) out["Prompt"] = String(a["prompt.id"]);
      break;
    default:
      return null;
  }
  return Object.keys(out).length ? out : null;
}

function EventRow({ ev, expanded, onToggle }: { ev: LiveEvent; expanded: boolean; onToggle: () => void }) {
  const meta = EVENT_META[ev.type] ?? {
    dot: "bg-slate-500", bg: "bg-slate-500/8", border: "border-slate-500/20",
    label: ev.type, accent: "text-slate-300",
  };
  const primary = primaryLine(ev);
  const detail = detailLine(ev);
  const isError = ev.type === "api_error" || (ev.type === "tool_result" && ev.attrs?.success === "false");
  const details = expanded ? expandedDetail(ev) : null;

  return (
    <div
      onClick={onToggle}
      className={`min-w-0 overflow-hidden rounded-lg border ${meta.border} ${meta.bg} px-2.5 py-1.5 text-[11px] cursor-pointer transition-colors hover:bg-white/5 ${isError ? "ring-1 ring-rose-500/30" : ""}`}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="flex flex-shrink-0 items-center gap-1.5 pt-px">
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          <span className="tabular-nums text-slate-500">{timeStr(ev.receivedAt)}</span>
          <span className={`w-[52px] text-right font-semibold uppercase tracking-wide text-[9px] ${meta.accent}`}>{meta.label}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-slate-200">{primary}</p>
          {detail && !expanded && (
            <p className="truncate font-mono text-[10px] text-slate-500">{detail}</p>
          )}
        </div>
      </div>
      {details && (
        <div className="mt-1.5 border-t border-white/5 pt-1.5 pl-[88px]">
          {Object.entries(details).map(([k, v]) => (
            <div key={k} className="flex gap-2 py-0.5 font-mono">
              <span className="flex-shrink-0 text-[10px] text-slate-500 w-14 text-right">{k}</span>
              <span className="text-[10px] text-slate-300 break-all">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LiveFeed() {
  const { events, connected } = useLiveFeed();
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [pauseSnapshot, setPauseSnapshot] = useState<LiveEvent[]>([]);

  const displayEvents = paused ? pauseSnapshot : events;

  const filtered = displayEvents.filter((ev) => {
    if (filter !== "all" && ev.type !== filter) return false;
    if (search) {
      const hay = JSON.stringify(ev).toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const handlePause = () => {
    if (!paused) setPauseSnapshot([...events]);
    setPaused(!paused);
  };

  const buffered = paused ? events.length - pauseSnapshot.length : 0;

  return (
    <aside className="w-full overflow-hidden flex flex-col rounded-2xl border border-white/10 bg-slate-950/85 shadow-[0_20px_50px_rgba(2,6,23,0.28)] backdrop-blur-md" style={{ height: "100%", minHeight: 420, maxHeight: 720 }}>
      <div className="flex-shrink-0 border-b border-white/10 px-3 py-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Live</p>
            <h2 className="mt-0.5 text-sm font-semibold text-slate-50">Feed</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePause}
              title={paused ? "Resume live updates" : "Pause live updates"}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                paused
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
              }`}
            >
              {paused ? `▶ ${buffered > 0 ? `+${buffered}` : "Resume"}` : "⏸"}
            </button>
            {filtered.length > 0 && (
              <span className="rounded-md bg-white/5 px-2 py-0.5 text-[10px] tabular-nums text-slate-400">
                {filtered.length}
              </span>
            )}
            <span className={`flex items-center gap-1.5 text-[10px] ${connected ? "text-emerald-300" : "text-slate-500"}`} title={connected ? "SSE connection active" : "Disconnected — reconnecting"}>
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
              {connected ? "Live" : "Off"}
            </span>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setFilter(key); setExpandedIdx(null); }}
              className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors ${
                filter === key
                  ? "bg-white/10 text-slate-50"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              {label}
            </button>
          ))}
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setExpandedIdx(null); }}
            placeholder="Search…"
            className="ml-auto w-24 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-white/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex h-full min-h-[360px] items-center justify-center">
            <p className="text-xs text-slate-500">
              {events.length === 0 ? "Waiting for events…" : "No matching events"}
            </p>
          </div>
        ) : (
          filtered.map((ev, i) => (
            <EventRow
              key={`${ev.receivedAt}-${i}`}
              ev={ev}
              expanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
