import { describe, expect, it } from "vitest";
import {
  COMMAND_ACCENTS,
  commandKeyModel,
  commandKeySvg,
  sessionTileModel,
  sessionTileSvg,
  svgToDataUri,
  tileSvg,
  usageTileModel,
} from "../src/core/render.js";
import { aggregateStates } from "../src/core/state-watcher.js";
import type { SessionEntry, UsageSnapshot } from "../src/core/types.js";

const snapshot: UsageSnapshot = {
  block: {
    costUSD: 73.451254,
    totalTokens: 31_268_426,
    inputTokens: 25_365,
    outputTokens: 156_653,
    startTime: "2026-07-15T19:00:00.000Z",
    endTime: "2026-07-16T00:00:00.000Z",
    remainingMinutes: 200,
    projectedCostUSD: 243.97,
    costPerHour: 51.16,
  },
  today: { costUSD: 88.2, totalTokens: 40_000_000, inputTokens: 1, outputTokens: 2 },
  week: { costUSD: 402.5, totalTokens: 200_000_000, inputTokens: 1, outputTokens: 2 },
  month: { costUSD: 1250.75, totalTokens: 900_000_000, inputTokens: 1, outputTokens: 2 },
  updatedAt: Date.parse("2026-07-15T20:00:00Z"),
};

describe("usageTileModel", () => {
  it("renders block cost with time remaining and projection", () => {
    const m = usageTileModel(snapshot, "block", "cost", false);
    expect(m.title).toBe("5h Block");
    expect(m.value).toBe("$73.45");
    expect(m.subtitle).toBe("3h 20m left → $244");
    expect(m.stale).toBe(false);
  });

  it("renders token metric and scope totals", () => {
    expect(usageTileModel(snapshot, "block", "tokens", false).value).toBe("31.3M");
    expect(usageTileModel(snapshot, "today", "cost", false).value).toBe("$88.20");
    expect(usageTileModel(snapshot, "week", "cost", false).value).toBe("$403");
    expect(usageTileModel(snapshot, "month", "tokens", false).value).toBe("900M");
  });

  it("handles no active block, no data, and stale marker", () => {
    expect(usageTileModel({ ...snapshot, block: null }, "block", "cost", false).subtitle).toBe(
      "no active block",
    );
    const loading = usageTileModel(null, "today", "cost", false);
    expect(loading.value).toBe("—");
    expect(loading.subtitle).toBe("loading…");
    const stale = usageTileModel(null, "today", "cost", true);
    expect(stale.subtitle).toBe("ccusage error");
    expect(usageTileModel(snapshot, "today", "cost", true).stale).toBe(true);
  });
});

describe("sessionTileModel", () => {
  const working: SessionEntry = {
    sessionId: "a",
    state: "working",
    cwd: "/x/repo",
    project: "repo",
    lastActivity: "",
    updatedAt: "",
  };

  it("shows the aggregate state with session count", () => {
    const m = sessionTileModel(aggregateStates([working, { ...working, sessionId: "b", state: "idle" }]));
    expect(m.value).toBe("Working");
    expect(m.subtitle).toBe("2 sessions");
  });

  it("shows the project name for a single session and no-data for none", () => {
    expect(sessionTileModel(aggregateStates([working])).subtitle).toBe("repo");
    const empty = sessionTileModel(aggregateStates([]));
    expect(empty.value).toBe("No data");
    expect(empty.subtitle).toBe("no sessions");
  });
});

describe("commandKeyModel", () => {
  it("maps each preset to its glyph, label, and accent", () => {
    expect(commandKeyModel("accept")).toEqual({ glyph: "check", label: "Accept", accent: COMMAND_ACCENTS.accept });
    expect(commandKeyModel("reject")).toEqual({ glyph: "cross", label: "Reject", accent: COMMAND_ACCENTS.reject });
    expect(commandKeyModel("new-chat")).toEqual({
      glyph: "new-chat",
      label: "New Chat",
      accent: COMMAND_ACCENTS["new-chat"],
    });
    expect(commandKeyModel(undefined)).toEqual(commandKeyModel("accept")); // default
  });

  it("previews custom text, truncated to fit the key", () => {
    expect(commandKeyModel("custom", "/compact")).toMatchObject({ glyph: "text", preview: "/compact" });
    expect(commandKeyModel("custom", "/a-very-long-command")).toMatchObject({ preview: "/a-very-…" });
    expect(commandKeyModel("custom", "")).toMatchObject({ preview: "…" });
  });
});

describe("commandKeySvg", () => {
  it("draws the glyph path in the preset accent", () => {
    for (const preset of ["accept", "reject", "new-chat"] as const) {
      const model = commandKeyModel(preset);
      const svg = commandKeySvg(model);
      expect(svg).toContain(`stroke="${model.accent}"`);
      expect(svg).toContain(model.label);
      expect(svg).not.toContain("__A__");
    }
  });

  it("renders escaped custom text instead of a glyph", () => {
    const svg = commandKeySvg(commandKeyModel("custom", "a<b&c"));
    expect(svg).toContain("a&lt;b&amp;c");
    expect(svg).toContain("Custom");
    expect(svg).not.toContain("<path");
  });
});

describe("SVG output", () => {
  it("embeds escaped values and produces a data URI", () => {
    const svg = tileSvg({ title: "A<B", value: "$1 & up", subtitle: "x>y", accent: "#fff", stale: true });
    expect(svg).toContain("A&lt;B");
    expect(svg).toContain("$1 &amp; up");
    expect(svg).toContain("⚠");
    expect(svgToDataUri(svg)).toMatch(/^data:image\/svg\+xml;charset=utf-8;base64,/);

    const session = sessionTileSvg({ title: "Claude", value: "Working", subtitle: "2 sessions", accent: "#E5A50A", stale: false });
    expect(session).toContain("Working");
    expect(session).toContain("#E5A50A");
  });
});
