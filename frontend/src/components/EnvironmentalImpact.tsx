import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

// ── Energy estimation constants ───────────────────────────────────────────────
// Based on LLM inference research (Luccioni et al. 2023, "Power Hungry Processing").
// Anthropic's actual infrastructure figures are not publicly available.
// CO₂ intensity: US average grid (EPA 2023, 0.386 kg CO₂/kWh).

// Real-world equivalence anchors
const PHONE_KWH    = 0.015;   // 15 Wh per smartphone charge
const CAR_CO2_KM   = 0.21;    // kg CO₂ per km, average ICE vehicle
const LED_KWH      = 0.01;    // 10W LED bulb — kWh per hour
const TREE_KG_YEAR = 22;      // kg CO₂ absorbed per tree per year

interface EnvRow {
  date: string;
  energy_kwh: number;
  co2_kg: number;
  cache_saved_kwh: number;
  cache_saved_co2_kg: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
}

type Period = "today" | "week" | "month";

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week",  label: "Week"  },
  { key: "month", label: "Month" },
];

// ── Count-up animation ────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [displayed, setDisplayed] = useState(0);
  const prevTarget = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = prevTarget.current;
    const to = target;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevTarget.current = to;
        setDisplayed(to);
      }
    };

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return displayed;
}

// ── SVG Ring Gauge ─────────────────────────────────────────────────────────────
// 270° arc. Progress fills clockwise from ~8 o'clock to ~4 o'clock.
// Color: emerald → amber → orange as usage increases.
function RingGauge({ co2Kg, maxKg, size = 220 }: { co2Kg: number; maxKg: number; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.36;                          // radius
  const C  = 2 * Math.PI * r;                      // full circumference
  const arcLen = C * (270 / 360);                  // 270° track
  const progress = Math.min(co2Kg / Math.max(maxKg, 1e-9), 1);
  const filled   = progress * arcLen;

  const color =
    progress < 0.35 ? "#10b981"   // emerald
  : progress < 0.70 ? "#f59e0b"   // amber
  : "#f97316";                     // orange

  const glowRgba =
    progress < 0.35 ? "rgba(16,185,129,0.45)"
  : progress < 0.70 ? "rgba(245,158,11,0.45)"
  : "rgba(249,115,22,0.45)";

  const rotate = `rotate(-225,${cx},${cy})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`Carbon footprint ring: ${(co2Kg * 1000).toFixed(1)}g CO₂`}
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id="ringBg" cx="50%" cy="50%" r="50%">
          <stop offset="60%"  stopColor={color} stopOpacity="0.04" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Subtle radial background glow */}
      <circle cx={cx} cy={cy} r={r + 20} fill="url(#ringBg)" />

      {/* Track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={13}
        strokeLinecap="round"
        strokeDasharray={`${arcLen} ${C}`}
        transform={rotate}
      />

      {/* Glow layer (blurred duplicate) */}
      {filled > 2 && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${Math.max(filled - 6, 0)} ${C}`}
          transform={rotate}
          style={{
            filter: "blur(7px)",
            opacity: 0.55,
            transition: "stroke-dasharray 1.1s cubic-bezier(0.34,1.2,0.64,1), stroke 0.7s ease",
          }}
        />
      )}

      {/* Progress arc */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={13}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${C}`}
        transform={rotate}
        style={{
          filter: `drop-shadow(0 0 5px ${glowRgba})`,
          transition: "stroke-dasharray 1.1s cubic-bezier(0.34,1.2,0.64,1), stroke 0.7s ease",
        }}
      />

      {/* Tick marks at 0%, 50%, 100% positions */}
      {[0, 0.5, 1].map((p) => {
        const angle = (-225 + p * 270) * (Math.PI / 180);
        const ix = cx + (r + 18) * Math.cos(angle);
        const iy = cy + (r + 18) * Math.sin(angle);
        return (
          <circle key={p} cx={ix} cy={iy} r={2}
            fill={p <= progress ? color : "rgba(255,255,255,0.18)"} />
        );
      })}
    </svg>
  );
}

// ── CO₂ / Energy formatter ───────────────────────────────────────────────────
function fmtCO2(kg: number) {
  if (kg < 0.0001)  return { val: (kg * 1e6).toFixed(1), unit: "µg" };
  if (kg < 1)       return { val: (kg * 1000).toFixed(2), unit: "g" };
  return               { val: kg.toFixed(3), unit: "kg" };
}

function fmtEnergy(kwh: number) {
  if (kwh < 0.001)  return { val: (kwh * 1e6).toFixed(1), unit: "µWh" };
  if (kwh < 1)      return { val: (kwh * 1000).toFixed(2), unit: "Wh" };
  return               { val: kwh.toFixed(4), unit: "kWh" };
}

// ── Equivalence card ─────────────────────────────────────────────────────────
function EqCard({
  emoji, value, unit, dataTestId,
}: {
  emoji: string;
  value: string;
  unit: string;
  dataTestId: string;
}) {
  return (
    <div
      data-testid={dataTestId}
      className="group rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 transition-all
                 hover:border-white/[0.15] hover:bg-white/[0.06] hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="text-xl leading-none">{emoji}</div>
      <div className="mt-2 text-base font-semibold tabular-nums tracking-tight text-slate-100">
        {value}
      </div>
      <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{unit}</div>
    </div>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
const SparkTooltip = ({ active, payload, label }: {
  active?: boolean; payload?: { value: number }[]; label?: string;
}) => {
  if (!active || !payload?.length) return null;
  const { val, unit } = fmtCO2(payload[0].value);
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/95 px-2.5 py-1.5 text-[11px] shadow-xl">
      <p className="text-slate-400">{label}</p>
      <p className="font-semibold text-slate-100">{val} {unit} CO₂</p>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export default function EnvironmentalImpact() {
  const [period, setPeriod] = useState<Period>("today");

  const { data: rows = [] } = useQuery<EnvRow[]>({
    queryKey: ["environmental", 30],
    queryFn: () => fetch("/api/environmental?days=30").then((r) => r.json()),
    refetchInterval: 60_000,
  });

  const periodDays = period === "today" ? 1 : period === "week" ? 7 : 30;

  // Aggregate over the selected period
  const totals = useMemo(() => {
    const slice = rows.slice(-periodDays);
    return slice.reduce(
      (acc, r) => ({
        energy_kwh:       acc.energy_kwh       + r.energy_kwh,
        co2_kg:           acc.co2_kg           + r.co2_kg,
        cache_saved_co2_kg: acc.cache_saved_co2_kg + r.cache_saved_co2_kg,
        cache_saved_kwh:  acc.cache_saved_kwh  + r.cache_saved_kwh,
      }),
      { energy_kwh: 0, co2_kg: 0, cache_saved_co2_kg: 0, cache_saved_kwh: 0 },
    );
  }, [rows, periodDays]);

  // Animated values
  const animCO2    = useCountUp(totals.co2_kg);
  const animEnergy = useCountUp(totals.energy_kwh);
  const animSaved  = useCountUp(totals.cache_saved_co2_kg);

  // Ring reference max (CO₂ kg) — full ring = a heavy-use period for context.
  // ~0.04 kg/day is a typical active day; heavy days can reach 0.10+ kg.
  const ringMax = period === "today" ? 0.08 : period === "week" ? 0.4 : 1.2;

  // Equivalences (using animated CO₂/energy values)
  const phoneCharges = animEnergy / PHONE_KWH;
  const kmDriven     = animCO2   / CAR_CO2_KM;
  const ledHours     = animEnergy / LED_KWH;
  const treeDays     = animCO2   / (TREE_KG_YEAR / 365);

  function fmtPhones(v: number)   { return v < 1 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toString(); }
  function fmtKm(v: number)       { return v < 0.01 ? (v * 1000).toFixed(1) + "m" : v < 100 ? v.toFixed(2) : v.toFixed(1); }
  function fmtLED(v: number)      { return v < 1 ? (v * 60).toFixed(0) + " min" : v < 1000 ? v.toFixed(1) : Math.round(v).toString(); }
  function fmtTreeDays(v: number) { return v < 1 ? (v * 24).toFixed(1) + " hr" : v < 100 ? v.toFixed(2) : v.toFixed(1); }

  const co2fmt   = fmtCO2(animCO2);
  const nrgfmt   = fmtEnergy(animEnergy);
  const savedFmt = fmtCO2(animSaved);

  // Cache reduction percent (guard div-by-zero)
  const totalWithSaved = totals.co2_kg + totals.cache_saved_co2_kg;
  const cacheReducePct = totalWithSaved > 0
    ? Math.round((totals.cache_saved_co2_kg / totalWithSaved) * 100)
    : 0;

  return (
    <div
      data-testid="environmental-impact"
      className="rounded-2xl border border-white/[0.08] bg-slate-900/50 p-5 backdrop-blur-sm"
    >
      {/* ── Header ── */}
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
            Environment
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-50">Carbon Footprint</h2>
        </div>
        <div className="flex gap-1">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              data-testid={`period-${key}`}
              onClick={() => setPeriod(key)}
              className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                period === key
                  ? "border-white/20 bg-white/10 text-slate-50"
                  : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">

        {/* Ring + center stats */}
        <div className="relative mx-auto flex-shrink-0 sm:mx-0">
          <RingGauge co2Kg={totals.co2_kg} maxKg={ringMax} size={220} />

          {/* Centered numbers overlay */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            {/* CO₂ value */}
            <div
              data-testid="co2-value"
              className="text-4xl font-bold tabular-nums tracking-tight text-slate-50"
            >
              {co2fmt.val}
            </div>
            <div className="text-sm font-medium text-slate-400">
              {co2fmt.unit} CO₂
            </div>
            {/* Energy pill */}
            <div
              data-testid="energy-value"
              className="mt-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] tabular-nums text-slate-400"
            >
              {nrgfmt.val} {nrgfmt.unit}
            </div>
          </div>
        </div>

        {/* Right: ring legend + cache badge + equivalences */}
        <div className="flex flex-1 flex-col gap-3">
          {/* Ring gauge legend */}
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span>Ring fill vs {period === "today" ? "80g" : period === "week" ? "400g" : "1.2kg"} daily budget:</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />&lt;35%</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />&lt;70%</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-orange-500" />&ge;70%</span>
          </div>
          {/* Cache savings badge */}
          {totals.cache_saved_co2_kg > 0 && (
            <div
              data-testid="cache-savings"
              className="flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-950/40 px-3 py-2.5"
            >
              <div className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
              <div className="text-xs leading-snug text-emerald-300">
                Prompt cache avoided{" "}
                <span data-testid="cache-saved-value" className="font-semibold">
                  {savedFmt.val} {savedFmt.unit} CO₂
                </span>{" "}
                {cacheReducePct > 0 && (
                  <span className="text-emerald-400/70">({cacheReducePct}% reduction)</span>
                )}
              </div>
            </div>
          )}

          {/* 2×2 equivalences grid */}
          <div className="grid grid-cols-2 gap-2">
            <EqCard
              emoji="📱"
              value={fmtPhones(phoneCharges)}
              unit="phone charges"
              dataTestId="eq-phones"
            />
            <EqCard
              emoji="🚗"
              value={fmtKm(kmDriven)}
              unit="km driven equiv."
              dataTestId="eq-km"
            />
            <EqCard
              emoji="💡"
              value={fmtLED(ledHours)}
              unit="hrs LED light"
              dataTestId="eq-led"
            />
            <EqCard
              emoji="🌲"
              value={fmtTreeDays(treeDays)}
              unit="tree-days to offset"
              dataTestId="eq-tree"
            />
          </div>
        </div>
      </div>

      {/* ── Sparkline ── */}
      {rows.length > 1 && (
        <div className="mt-5" data-testid="sparkline">
          <p className="mb-2 text-[11px] text-slate-600">CO₂ per day (last {rows.length} days)</p>
          <ResponsiveContainer width="100%" height={52}>
            <AreaChart data={rows} margin={{ top: 2, right: 4, left: 4, bottom: 2 }}>
              <defs>
                <linearGradient id="envAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="co2_kg"
                stroke="#10b981"
                strokeWidth={1.5}
                fill="url(#envAreaGrad)"
                dot={false}
                activeDot={{ r: 3, fill: "#10b981" }}
              />
              <Tooltip content={<SparkTooltip />} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Disclaimer ── */}
      <p className="mt-4 text-[10px] leading-relaxed text-slate-700">
        Energy estimates from LLM inference research (Luccioni et al., 2023). CO₂ uses
        US average grid intensity (EPA 2023, 0.386 kg/kWh). Anthropic's actual
        infrastructure figures are not public. Treat as order-of-magnitude estimates.
      </p>
    </div>
  );
}
