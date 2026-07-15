import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildHookCommand,
  HOOK_EVENTS,
  installHooks,
  isHookInstalled,
  removeHooks,
} from "../src/core/hook-installer.js";

const SCRIPT = "/Applications/plugin/bin/claude-state-hook.mjs";

let dir: string;
let settingsPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "claude-deck-installer-"));
  settingsPath = path.join(dir, "settings.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = () => JSON.parse(readFileSync(settingsPath, "utf8"));
const backups = () => readdirSync(dir).filter((f) => f.includes("claude-deck-backup"));

describe("installHooks", () => {
  it("creates settings.json fresh with all hook events", async () => {
    const result = await installHooks(settingsPath, SCRIPT);
    expect(result).toMatchObject({ ok: true, changed: true });
    const settings = read();
    for (const event of HOOK_EVENTS) {
      const groups = settings.hooks[event];
      expect(groups).toHaveLength(1);
      expect(groups[0].hooks[0].command).toBe(buildHookCommand(SCRIPT));
    }
    expect(isHookInstalled(settings, SCRIPT)).toBe(true);
    expect(backups()).toHaveLength(0); // nothing existed to back up
  });

  it("merges with existing hooks without clobbering them, and backs up first", async () => {
    const existing = {
      model: "opus",
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "my-linter --check" }] }],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(existing));

    const result = await installHooks(settingsPath, SCRIPT);
    expect(result).toMatchObject({ ok: true, changed: true });
    expect(backups()).toHaveLength(1);
    expect(JSON.parse(readFileSync(path.join(dir, backups()[0]!), "utf8"))).toEqual(existing);

    const settings = read();
    expect(settings.model).toBe("opus"); // untouched
    expect(settings.hooks.PreToolUse).toHaveLength(2);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("my-linter --check");
    expect(isHookInstalled(settings, SCRIPT)).toBe(true);
  });

  it("is idempotent", async () => {
    await installHooks(settingsPath, SCRIPT);
    const first = readFileSync(settingsPath, "utf8");
    const again = await installHooks(settingsPath, SCRIPT);
    expect(again).toMatchObject({ ok: true, changed: false });
    expect(readFileSync(settingsPath, "utf8")).toBe(first);
  });

  it("aborts on corrupt settings.json without writing anything", async () => {
    writeFileSync(settingsPath, "{ definitely not json");
    const result = await installHooks(settingsPath, SCRIPT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not valid JSON");
    expect(readFileSync(settingsPath, "utf8")).toBe("{ definitely not json");
    expect(backups()).toHaveLength(0);
  });
});

describe("removeHooks", () => {
  it("removes only our entries and cleans up empty structures", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "my-linter" }] }],
        },
      }),
    );
    await installHooks(settingsPath, SCRIPT);
    const result = await removeHooks(settingsPath, SCRIPT);
    expect(result).toMatchObject({ ok: true, changed: true });

    const settings = read();
    expect(settings.hooks.PreToolUse).toHaveLength(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("my-linter");
    expect(settings.hooks.SessionStart).toBeUndefined();
    expect(isHookInstalled(settings, SCRIPT)).toBe(false);
  });

  it("removes the hooks key entirely when we were the only hooks", async () => {
    await installHooks(settingsPath, SCRIPT);
    await removeHooks(settingsPath, SCRIPT);
    expect(read().hooks).toBeUndefined();
  });

  it("is a no-op when nothing is installed", async () => {
    const result = await removeHooks(settingsPath, SCRIPT);
    expect(result).toMatchObject({ ok: true, changed: false });
    expect(existsSync(settingsPath)).toBe(false);
  });
});
