import { describe, expect, it } from "vitest";
import { formatMinutes, formatTokens, formatUSD, lastNDates, localDateString } from "../src/core/formatters.js";

describe("formatUSD", () => {
  it("formats small and large amounts for a 144px tile", () => {
    expect(formatUSD(0)).toBe("$0.00");
    expect(formatUSD(3.382317)).toBe("$3.38");
    expect(formatUSD(73.451254)).toBe("$73.45");
    expect(formatUSD(243.97)).toBe("$244");
    expect(formatUSD(12345)).toBe("$12.3k");
  });

  it("handles garbage", () => {
    expect(formatUSD(Number.NaN)).toBe("$—");
    expect(formatUSD(-1)).toBe("$—");
  });
});

describe("formatTokens", () => {
  it("humanizes token counts", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(3_100)).toBe("3.1k");
    expect(formatTokens(31_268_426)).toBe("31.3M");
    expect(formatTokens(310_000_000)).toBe("310M");
    expect(formatTokens(1_200_000_000)).toBe("1.2B");
  });
});

describe("formatMinutes", () => {
  it("formats durations", () => {
    expect(formatMinutes(200)).toBe("3h 20m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(0.4)).toBe("<1m");
    expect(formatMinutes(null)).toBe("—");
  });
});

describe("date helpers", () => {
  it("computes local dates and trailing windows across month boundaries", () => {
    const d = new Date(2026, 6, 2, 9, 30); // July 2, 2026 local
    expect(localDateString(d)).toBe("2026-07-02");
    const week = lastNDates(d, 7);
    expect(week.size).toBe(7);
    expect(week.has("2026-07-02")).toBe(true);
    expect(week.has("2026-06-26")).toBe(true);
    expect(week.has("2026-06-25")).toBe(false);
  });
});
