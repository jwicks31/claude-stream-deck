import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { normalizeBlocks, normalizeDaily } from "./normalize.js";
import type { UsageSnapshot } from "./types.js";

export type CcusageInvocation = { cmd: string; baseArgs: string[] };
export type CcusageRunner = (args: string[]) => Promise<string>;

type Logger = { debug(msg: string): void; warn(msg: string): void };

/**
 * Resolve how to invoke ccusage. ccusage >= 20 ships per-platform native
 * binaries (no programmatic API), so we spawn. Order:
 * 1. user override from settings, 2. the platform binary bundled in the plugin,
 * 3. the bundled npm launcher via our own Node, 4. `ccusage` on PATH.
 */
export function resolveCcusageInvocation(pluginDir: string, override?: string): CcusageInvocation {
  if (override && override.trim().length > 0) {
    const parts = override.trim().split(/\s+/);
    return { cmd: parts[0]!, baseArgs: parts.slice(1) };
  }

  const exe = process.platform === "win32" ? "ccusage.exe" : "ccusage";
  const bundledBinary = path.join(
    pluginDir,
    "bin",
    "ccusage",
    `${process.platform}-${process.arch}`,
    exe,
  );
  if (existsSync(bundledBinary)) return { cmd: bundledBinary, baseArgs: [] };

  const bundledLauncher = path.join(pluginDir, "bin", "ccusage", "cli.js");
  if (existsSync(bundledLauncher)) return { cmd: process.execPath, baseArgs: [bundledLauncher] };

  return { cmd: "ccusage", baseArgs: [] };
}

/** A runner that spawns the resolved ccusage with a timeout and JSON-friendly env. */
export function makeCcusageRunner(
  invocation: CcusageInvocation,
  opts: { timeoutMs?: number } = {},
): CcusageRunner {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(
        invocation.cmd,
        [...invocation.baseArgs, ...args],
        {
          timeout: timeoutMs,
          maxBuffer: 128 * 1024 * 1024,
          env: { ...process.env, NO_COLOR: "1" },
        },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        },
      );
    });
}

/** `--since` compact date covering both month-to-date and the trailing 7 days. */
export function sinceArg(now: Date): string {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
  const d = weekStart < monthStart ? weekStart : monthStart;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${m}${day}`;
}

/**
 * One tick: two ccusage invocations (blocks + daily) normalized into a single
 * snapshot that feeds every visible tile.
 */
export async function fetchSnapshot(
  run: CcusageRunner,
  now: Date = new Date(),
  logger?: Logger,
): Promise<UsageSnapshot> {
  const [blocksRaw, dailyRaw] = await Promise.all([
    run(["blocks", "--json"]),
    run(["daily", "--json", "--since", sinceArg(now)]),
  ]);
  logger?.debug(`ccusage tick: blocks=${blocksRaw.length}B daily=${dailyRaw.length}B`);
  const block = normalizeBlocks(JSON.parse(blocksRaw));
  const { today, week, month } = normalizeDaily(JSON.parse(dailyRaw), now);
  return { block, today, week, month, updatedAt: now.getTime() };
}
