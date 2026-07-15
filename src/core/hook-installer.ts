import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

/** Claude Code lifecycle events the state hook subscribes to. */
export const HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "Notification",
  "Stop",
  "SessionEnd",
] as const;

export type InstallResult =
  | { ok: true; changed: boolean; backupPath?: string }
  | { ok: false; error: string };

type HookCommand = { type: string; command: string; [k: string]: unknown };
type MatcherGroup = { matcher?: string; hooks?: HookCommand[]; [k: string]: unknown };

/** The command registered in settings.json; the script path doubles as our marker. */
export function buildHookCommand(scriptPath: string): string {
  return `node ${JSON.stringify(scriptPath)}`;
}

function groupHasOurCommand(group: MatcherGroup, scriptPath: string): boolean {
  return (group.hooks ?? []).some(
    (h) => typeof h?.command === "string" && h.command.includes(scriptPath),
  );
}

/** Whether every hook event already carries our command. */
export function isHookInstalled(settings: unknown, scriptPath: string): boolean {
  const hooks = (settings as { hooks?: Record<string, unknown> } | null)?.hooks;
  if (hooks === null || typeof hooks !== "object") return false;
  return HOOK_EVENTS.every((event) => {
    const groups = hooks[event];
    return Array.isArray(groups) && groups.some((g) => groupHasOurCommand(g as MatcherGroup, scriptPath));
  });
}

async function readSettings(
  settingsPath: string,
): Promise<{ ok: true; settings: Record<string, unknown>; existed: boolean } | { ok: false; error: string }> {
  let text: string;
  try {
    text = await fs.readFile(settingsPath, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { ok: true, settings: {}, existed: false };
    return { ok: false, error: `Cannot read ${settingsPath}: ${String(err)}` };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: `${settingsPath} is not a JSON object; refusing to modify it.` };
    }
    return { ok: true, settings: parsed as Record<string, unknown>, existed: true };
  } catch (err) {
    return {
      ok: false,
      error: `${settingsPath} is not valid JSON (${String(err)}); refusing to modify it. Fix or remove the file and retry.`,
    };
  }
}

async function writeSettingsAtomic(
  settingsPath: string,
  settings: Record<string, unknown>,
  backup: boolean,
): Promise<string | undefined> {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  let backupPath: string | undefined;
  if (backup) {
    backupPath = `${settingsPath}.claude-deck-backup-${Date.now()}`;
    await fs.copyFile(settingsPath, backupPath);
  }
  const tmp = `${settingsPath}.claude-deck-tmp-${process.pid}`;
  await fs.writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await fs.rename(tmp, settingsPath);
  return backupPath;
}

/**
 * Merge our hook entries into settings.json: read → back up → merge (never
 * clobbering existing hooks) → atomic write. Idempotent.
 */
export async function installHooks(settingsPath: string, scriptPath: string): Promise<InstallResult> {
  const read = await readSettings(settingsPath);
  if (!read.ok) return read;

  const settings = read.settings;
  const hooks = (settings.hooks ??= {}) as Record<string, unknown>;
  if (typeof hooks !== "object" || Array.isArray(hooks)) {
    return { ok: false, error: `"hooks" in ${settingsPath} is not an object; refusing to modify it.` };
  }

  let changed = false;
  for (const event of HOOK_EVENTS) {
    const existing = hooks[event];
    const groups: MatcherGroup[] = Array.isArray(existing) ? (existing as MatcherGroup[]) : [];
    if (!Array.isArray(existing) && existing !== undefined) {
      return { ok: false, error: `hooks.${event} in ${settingsPath} is not an array; refusing to modify it.` };
    }
    if (!groups.some((g) => groupHasOurCommand(g, scriptPath))) {
      groups.push({ hooks: [{ type: "command", command: buildHookCommand(scriptPath) }] });
      hooks[event] = groups;
      changed = true;
    }
  }

  if (!changed) return { ok: true, changed: false };
  try {
    const backupPath = await writeSettingsAtomic(settingsPath, settings, read.existed);
    return { ok: true, changed: true, backupPath };
  } catch (err) {
    return { ok: false, error: `Failed to write ${settingsPath}: ${String(err)}` };
  }
}

/** Remove only our hook entries; everything else is preserved byte-for-byte semantically. */
export async function removeHooks(settingsPath: string, scriptPath: string): Promise<InstallResult> {
  const read = await readSettings(settingsPath);
  if (!read.ok) return read;
  if (!read.existed) return { ok: true, changed: false };

  const settings = read.settings;
  const hooks = settings.hooks as Record<string, unknown> | undefined;
  if (hooks === null || hooks === undefined || typeof hooks !== "object") {
    return { ok: true, changed: false };
  }

  let changed = false;
  for (const event of Object.keys(hooks)) {
    const groups = hooks[event];
    if (!Array.isArray(groups)) continue;
    const next = (groups as MatcherGroup[])
      .map((g) => {
        if (!groupHasOurCommand(g, scriptPath)) return g;
        changed = true;
        const kept = (g.hooks ?? []).filter(
          (h) => !(typeof h?.command === "string" && h.command.includes(scriptPath)),
        );
        return { ...g, hooks: kept };
      })
      .filter((g) => (g.hooks ?? []).length > 0 || Object.keys(g).some((k) => k !== "hooks" && k !== "matcher"));
    if (next.length === 0) delete hooks[event];
    else hooks[event] = next;
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;

  if (!changed) return { ok: true, changed: false };
  try {
    const backupPath = await writeSettingsAtomic(settingsPath, settings, true);
    return { ok: true, changed: true, backupPath };
  } catch (err) {
    return { ok: false, error: `Failed to write ${settingsPath}: ${String(err)}` };
  }
}
