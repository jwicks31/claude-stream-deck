import { lastNDates, localDateString } from "./formatters.js";
import type { BlockUsage, UsageTotals } from "./types.js";

export function emptyTotals(): UsageTotals {
  return { costUSD: 0, totalTokens: 0, inputTokens: 0, outputTokens: 0 };
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function addEntry(into: UsageTotals, entry: Record<string, unknown>): void {
  into.costUSD += asNumber(entry.totalCost);
  into.totalTokens += asNumber(entry.totalTokens);
  into.inputTokens += asNumber(entry.inputTokens);
  into.outputTokens += asNumber(entry.outputTokens);
}

/**
 * Normalize `ccusage daily --json` output into today / last-7-days / month-to-date
 * totals. Tolerant of malformed entries; accepts both `period` (ccusage >= 20)
 * and `date` (older) keys.
 */
export function normalizeDaily(
  json: unknown,
  now: Date,
): { today: UsageTotals; week: UsageTotals; month: UsageTotals } {
  const today = emptyTotals();
  const week = emptyTotals();
  const month = emptyTotals();

  const rows = (json as { daily?: unknown[] } | null)?.daily;
  if (!Array.isArray(rows)) return { today, week, month };

  const todayStr = localDateString(now);
  const weekDates = lastNDates(now, 7);
  const monthPrefix = todayStr.slice(0, 7);

  for (const row of rows) {
    if (row === null || typeof row !== "object") continue;
    const entry = row as Record<string, unknown>;
    const date = typeof entry.period === "string" ? entry.period : entry.date;
    if (typeof date !== "string") continue;

    if (date === todayStr) addEntry(today, entry);
    if (weekDates.has(date)) addEntry(week, entry);
    if (date.startsWith(monthPrefix) && date <= todayStr) addEntry(month, entry);
  }
  return { today, week, month };
}

/** Extract the active 5h block from `ccusage blocks --json`, or null. */
export function normalizeBlocks(json: unknown): BlockUsage | null {
  const blocks = (json as { blocks?: unknown[] } | null)?.blocks;
  if (!Array.isArray(blocks)) return null;

  const active = blocks.find(
    (b): b is Record<string, unknown> =>
      b !== null && typeof b === "object" && (b as Record<string, unknown>).isActive === true,
  );
  if (!active) return null;

  const tokenCounts = (active.tokenCounts ?? {}) as Record<string, unknown>;
  const projection = (active.projection ?? null) as Record<string, unknown> | null;
  const burnRate = (active.burnRate ?? null) as Record<string, unknown> | null;

  return {
    costUSD: asNumber(active.costUSD),
    totalTokens: asNumber(active.totalTokens),
    inputTokens: asNumber(tokenCounts.inputTokens),
    outputTokens: asNumber(tokenCounts.outputTokens),
    startTime: typeof active.startTime === "string" ? active.startTime : "",
    endTime: typeof active.endTime === "string" ? active.endTime : "",
    remainingMinutes:
      projection && typeof projection.remainingMinutes === "number"
        ? projection.remainingMinutes
        : null,
    projectedCostUSD:
      projection && typeof projection.totalCost === "number" ? projection.totalCost : null,
    costPerHour: burnRate && typeof burnRate.costPerHour === "number" ? burnRate.costPerHour : null,
  };
}
