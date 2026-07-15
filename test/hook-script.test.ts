import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StateFile } from "../src/core/types.js";

const SCRIPT = path.resolve(__dirname, "..", "hooks", "claude-state-hook.mjs");

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "claude-deck-hook-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Run the real hook script with a simulated Claude Code stdin event. */
function runHook(event: Record<string, unknown>): Promise<{ code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [SCRIPT],
      { env: { ...process.env, CLAUDE_DECK_STATE_DIR: dir }, timeout: 10_000 },
      (error) => {
        // exit 0 always; a non-zero exit is a bug.
        if (error) reject(error);
        else resolve({ code: 0 });
      },
    );
    child.stdin!.end(JSON.stringify(event));
  });
}

function readState(): StateFile {
  return JSON.parse(readFileSync(path.join(dir, "state.json"), "utf8"));
}

const base = { session_id: "sess-1", cwd: "/Users/x/projects/my-repo", transcript_path: "/tmp/t.jsonl" };

describe("claude-state-hook.mjs (run for real)", () => {
  it("maps lifecycle events to states", async () => {
    const cases: Array<[string, string]> = [
      ["SessionStart", "idle"],
      ["UserPromptSubmit", "working"],
      ["PreToolUse", "working"],
      ["PostToolUse", "working"],
      ["Notification", "waiting"],
      ["Stop", "done"],
      ["SessionEnd", "offline"],
    ];
    for (const [eventName, expected] of cases) {
      await runHook({ ...base, hook_event_name: eventName });
      const state = readState();
      expect(state.sessions["sess-1"]!.state).toBe(expected);
      expect(state.sessions["sess-1"]!.project).toBe("my-repo");
      expect(state.sessions["sess-1"]!.cwd).toBe(base.cwd);
    }
  });

  it("keeps concurrent sessions as separate entries", async () => {
    await runHook({ ...base, hook_event_name: "UserPromptSubmit" });
    await runHook({ ...base, session_id: "sess-2", cwd: "/Users/x/other", hook_event_name: "Notification" });
    const state = readState();
    expect(Object.keys(state.sessions).sort()).toEqual(["sess-1", "sess-2"]);
    expect(state.sessions["sess-1"]!.state).toBe("working");
    expect(state.sessions["sess-2"]!.state).toBe("waiting");
  });

  it("refreshes lastActivity on activity events but not on Stop", async () => {
    await runHook({ ...base, hook_event_name: "UserPromptSubmit" });
    const activity1 = readState().sessions["sess-1"]!.lastActivity;
    await new Promise((r) => setTimeout(r, 15));
    await runHook({ ...base, hook_event_name: "PostToolUse" });
    const activity2 = readState().sessions["sess-1"]!.lastActivity;
    expect(Date.parse(activity2)).toBeGreaterThan(Date.parse(activity1));

    await runHook({ ...base, hook_event_name: "Stop" });
    expect(readState().sessions["sess-1"]!.lastActivity).toBe(activity2);
  });

  it("prunes entries older than 24h and survives a corrupt existing file", async () => {
    const old = new Date(Date.now() - 25 * 3600_000).toISOString();
    writeFileSync(
      path.join(dir, "state.json"),
      JSON.stringify({
        version: 1,
        sessions: { ancient: { sessionId: "ancient", state: "done", updatedAt: old, lastActivity: old } },
      }),
    );
    await runHook({ ...base, hook_event_name: "SessionStart" });
    expect(Object.keys(readState().sessions)).toEqual(["sess-1"]);

    writeFileSync(path.join(dir, "state.json"), "%%% corrupt %%%");
    await runHook({ ...base, hook_event_name: "Stop" });
    expect(readState().sessions["sess-1"]!.state).toBe("done");
  });

  it("ignores unknown events and garbage input without failing", async () => {
    await runHook({ ...base, hook_event_name: "SomethingNew" });
    await runHook({ hook_event_name: "Stop" }); // no session_id
    expect(() => readState()).toThrow(); // nothing written at all
  });
});
