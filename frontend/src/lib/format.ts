export function fmtCompact(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

export function fmtCurrency(value: number, digits = 2) {
  return `$${value.toFixed(digits)}`;
}

export function fmtPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtDurationMs(value: number) {
  if (value >= 60_000) {
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.round((value % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

export function fmtDurationSeconds(value: number) {
  if (value >= 3600) {
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  if (value >= 60) {
    const minutes = Math.floor(value / 60);
    const seconds = Math.round(value % 60);
    return `${minutes}m ${seconds}s`;
  }
  return `${Math.round(value)}s`;
}

export function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${month}/${day}`;
}

export function shortId(value: string, prefix = 6, suffix = 4) {
  if (value.length <= prefix + suffix + 3) return value;
  return `${value.slice(0, prefix)}…${value.slice(-suffix)}`;
}
