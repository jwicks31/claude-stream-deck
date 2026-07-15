import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeBlocks, normalizeDaily } from "../src/core/normalize.js";
import { sinceArg } from "../src/core/ccusage-source.js";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures", "ccusage", name), "utf8"));

describe("normalizeDaily (recorded real ccusage 20.0.17 output)", () => {
  const daily = fixture("daily.json") as { daily: Array<Record<string, unknown>> };

  it("buckets a real fixture into today / week / month", () => {
    // The fixture was recorded on 2026-07-15.
    const now = new Date(2026, 6, 15, 12, 0);
    const { today, week, month } = normalizeDaily(daily, now);

    const rows = daily.daily;
    const sum = (pred: (d: string) => boolean) =>
      rows
        .filter((r) => typeof r.period === "string" && pred(r.period as string))
        .reduce((acc, r) => acc + (r.totalCost as number), 0);

    expect(today.costUSD).toBeCloseTo(sum((d) => d === "2026-07-15"), 6);
    const weekDates = new Set(
      Array.from({ length: 7 }, (_, i) => `2026-07-${String(15 - i).padStart(2, "0")}`),
    );
    expect(week.costUSD).toBeCloseTo(sum((d) => weekDates.has(d)), 6);
    expect(month.costUSD).toBeCloseTo(sum((d) => d.startsWith("2026-07") && d <= "2026-07-15"), 6);
    expect(month.totalTokens).toBeGreaterThan(0);
    expect(week.costUSD).toBeLessThanOrEqual(month.costUSD + week.costUSD); // sanity
  });

  it("supports the older `date` key and skips malformed rows", () => {
    const now = new Date(2026, 6, 15);
    const { today } = normalizeDaily(
      { daily: [{ date: "2026-07-15", totalCost: 1.5, totalTokens: 10 }, null, 42, { totalCost: 9 }] },
      now,
    );
    expect(today.costUSD).toBe(1.5);
    expect(today.totalTokens).toBe(10);
  });

  it("returns zeros for missing/invalid payloads", () => {
    for (const bad of [null, {}, { daily: "nope" }, []]) {
      const { today, week, month } = normalizeDaily(bad, new Date());
      expect(today.costUSD + week.costUSD + month.costUSD).toBe(0);
    }
  });
});

describe("normalizeBlocks (recorded real ccusage 20.0.17 output)", () => {
  it("extracts the active block with projection and burn rate", () => {
    const block = normalizeBlocks(fixture("blocks.json"));
    expect(block).not.toBeNull();
    expect(block!.costUSD).toBeCloseTo(73.451254, 6);
    expect(block!.totalTokens).toBe(31_268_426);
    expect(block!.remainingMinutes).toBe(200);
    expect(block!.projectedCostUSD).toBeCloseTo(243.97, 2);
    expect(block!.costPerHour).toBeGreaterThan(0);
    expect(block!.inputTokens).toBe(25_365);
    expect(block!.outputTokens).toBe(156_653);
  });

  it("returns null when no block is active or payload is malformed", () => {
    expect(normalizeBlocks({ blocks: [{ isActive: false, costUSD: 5 }] })).toBeNull();
    expect(normalizeBlocks({})).toBeNull();
    expect(normalizeBlocks(null)).toBeNull();
    expect(normalizeBlocks({ blocks: [null, "x"] })).toBeNull();
  });
});

describe("sinceArg", () => {
  it("covers both month-to-date and the trailing 7 days", () => {
    expect(sinceArg(new Date(2026, 6, 15))).toBe("20260701"); // mid-month → month start
    expect(sinceArg(new Date(2026, 6, 3))).toBe("20260627"); // early month → 7 days back
  });
});
