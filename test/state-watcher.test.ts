import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  aggregateStates,
  applyDecay,
  parseStateFile,
  StateWatcher,
} from "../src/core/state-watcher.js";
import type { SessionEntry } from "../src/core/types.js";

const NOW = Date.parse("2026-07-15T20:00:00.000Z");

function entry(overrides: Partial<SessionEntry>): SessionEntry {
  return {
    sessionId: "s1",
    state: "working",
    cwd: "/Users/x/projects/my-repo",
    project: "my-repo",
    lastActivity: new Date(NOW - 1000).toISOString(),
    updatedAt: new Date(NOW - 1000).toISOString(),
    ...overrides,
  };
}

describe("parseStateFile", () => {
  it("parses a valid file", () => {
    const text = JSON.stringify({ version: 1, sessions: { abc: entry({ sessionId: "abc" }) } });
    const entries = parseStateFile(text);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.sessionId).toBe("abc");
    expect(entries[0]!.state).toBe("working");
  });

  it("tolerates missing, corrupt, and partial content", () => {
    expect(parseStateFile(null)).toEqual([]);
    expect(parseStateFile("")).toEqual([]);
    expect(parseStateFile("{ not json")).toEqual([]);
    expect(parseStateFile('{"sessions": 5}')).toEqual([]);
    const partial = parseStateFile('{"sessions": {"a": {"state": "nonsense"}, "b": null}}');
    expect(partial).toHaveLength(1);
    expect(partial[0]!.state).toBe("unknown");
  });
});

describe("applyDecay", () => {
  it("treats stale working sessions as idle", () => {
    const fresh = entry({ lastActivity: new Date(NOW - 30_000).toISOString() });
    const stale = entry({ lastActivity: new Date(NOW - 120_000).toISOString() });
    expect(applyDecay(fresh, NOW, 90_000).state).toBe("working");
    expect(applyDecay(stale, NOW, 90_000).state).toBe("idle");
  });

  it("does not decay non-working states", () => {
    const waiting = entry({ state: "waiting", lastActivity: new Date(NOW - 600_000).toISOString() });
    expect(applyDecay(waiting, NOW, 90_000).state).toBe("waiting");
  });
});

describe("aggregateStates", () => {
  it("prioritizes working > waiting > done > idle > offline", () => {
    const sessions = [
      entry({ sessionId: "a", state: "done" }),
      entry({ sessionId: "b", state: "waiting" }),
      entry({ sessionId: "c", state: "idle" }),
    ];
    expect(aggregateStates(sessions).state).toBe("waiting");
    sessions.push(entry({ sessionId: "d", state: "working" }));
    expect(aggregateStates(sessions).state).toBe("working");
  });

  it("filters by project name", () => {
    const sessions = [
      entry({ sessionId: "a", state: "working", project: "repo-a", cwd: "/x/repo-a" }),
      entry({ sessionId: "b", state: "idle", project: "repo-b", cwd: "/x/repo-b" }),
    ];
    expect(aggregateStates(sessions, "repo-b").state).toBe("idle");
    expect(aggregateStates(sessions, "repo-a").sessions).toHaveLength(1);
    expect(aggregateStates(sessions, "no-such").state).toBe("unknown");
  });

  it("is unknown with no sessions", () => {
    expect(aggregateStates([]).state).toBe("unknown");
  });
});

describe("StateWatcher (real temp files)", () => {
  let dir: string;
  let watcher: StateWatcher;

  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), "claude-deck-state-"));
  });

  afterEach(() => {
    watcher?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  function writeState(sessions: Record<string, SessionEntry>): void {
    writeFileSync(path.join(dir, "state.json"), JSON.stringify({ version: 1, sessions }));
  }

  it("reads state on start and reacts to file changes via fs.watch", async () => {
    writeState({ s1: entry({ sessionId: "s1", state: "working" }) });
    watcher = new StateWatcher({ dir, now: () => NOW, debounceMs: 20 });
    await watcher.start();
    expect(watcher.aggregate().state).toBe("working");

    const changed = new Promise<void>((resolve) => {
      watcher.onChange((entries) => {
        if (entries.some((e) => e.state === "waiting")) resolve();
      });
    });
    writeState({ s1: entry({ sessionId: "s1", state: "waiting" }) });
    await changed;
    expect(watcher.aggregate().state).toBe("waiting");
  });

  it("applies decay when reading", async () => {
    writeState({
      s1: entry({ sessionId: "s1", state: "working", lastActivity: new Date(NOW - 300_000).toISOString() }),
    });
    watcher = new StateWatcher({ dir, now: () => NOW });
    await watcher.start();
    expect(watcher.aggregate().state).toBe("idle");
  });

  it("reports unknown for a missing or corrupt file", async () => {
    watcher = new StateWatcher({ dir, now: () => NOW });
    await watcher.start();
    expect(watcher.aggregate().state).toBe("unknown");

    writeFileSync(path.join(dir, "state.json"), "{ truncated");
    await watcher.refresh();
    expect(watcher.aggregate().state).toBe("unknown");
  });
});
