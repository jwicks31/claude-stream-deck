/** "$0.42", "$73.45", "$243", "$1.2k" — sized for a 144px tile. */
export function formatUSD(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "$—";
  if (n < 100) return `$${n.toFixed(2)}`;
  if (n < 10_000) return `$${Math.round(n)}`;
  return `$${(n / 1000).toFixed(1)}k`;
}

/** "999", "3.1k", "31k", "31.3M", "1.2B". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return String(Math.round(n));
  const scaled = (value: number, suffix: string): string =>
    `${value < 100 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value))}${suffix}`;
  if (n < 1e6) return scaled(n / 1e3, "k");
  if (n < 1e9) return scaled(n / 1e6, "M");
  return scaled(n / 1e9, "B");
}

/** "3h 20m", "45m", "<1m". */
export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins < 0) return "—";
  if (mins < 1) return "<1m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Local calendar date as YYYY-MM-DD (ccusage buckets by local date). */
export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The last `days` local calendar dates ending at `now`, as YYYY-MM-DD. */
export function lastNDates(now: Date, days: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.add(localDateString(d));
  }
  return out;
}
