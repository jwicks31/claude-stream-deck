import { promises as fs, watch, type FSWatcher } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AggregateState, SessionEntry, SessionStateName } from "./types.js";
import { SESSION_STATES } from "./types.js";

export const DEFAULT_STATE_DIR = path.join(os.homedir(), ".claude", "streamdeck-usage");
export const STATE_FILE_NAME = "state.json";
/** `working` with no refresh in this window is treated as idle (crashed session). */
export const DEFAULT_DECAY_MS = 90_000;

type Logger = { debug(msg: string): void; warn(msg: string): void };

function isSessionState(v: unknown): v is SessionStateName {
  return typeof v === "string" && (SESSION_STATES as readonly string[]).includes(v);
}

/** Tolerant parse of state.json content: missing/corrupt/partial → []. */
export function parseStateFile(text: string | null): SessionEntry[] {
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const sessions = (data as { sessions?: unknown } | null)?.sessions;
  if (sessions === null || typeof sessions !== "object") return [];
  const out: SessionEntry[] = [];
  for (const [sessionId, raw] of Object.entries(sessions as Record<string, unknown>)) {
    if (raw === null || typeof raw !== "object") continue;
    const e = raw as Record<string, unknown>;
    out.push({
      sessionId,
      state: isSessionState(e.state) ? e.state : "unknown",
      cwd: typeof e.cwd === "string" ? e.cwd : "",
      project: typeof e.project === "string" ? e.project : "",
      model: typeof e.model === "string" ? e.model : undefined,
      lastActivity: typeof e.lastActivity === "string" ? e.lastActivity : "",
      updatedAt: typeof e.updatedAt === "string" ? e.updatedAt : "",
    });
  }
  return out;
}

/** Apply the working→idle decay for sessions that stopped reporting. */
export function applyDecay(entry: SessionEntry, nowMs: number, decayMs: number): SessionEntry {
  if (entry.state !== "working") return entry;
  const last = Date.parse(entry.lastActivity || entry.updatedAt);
  if (Number.isFinite(last) && nowMs - last > decayMs) return { ...entry, state: "idle" };
  return entry;
}

const AGGREGATE_PRIORITY: SessionStateName[] = ["working", "waiting", "done", "idle", "offline"];

/** Aggregate session states, optionally filtered to one project (basename match). */
export function aggregateStates(entries: SessionEntry[], projectFilter?: string): AggregateState {
  const filter = projectFilter?.trim();
  const sessions = filter
    ? entries.filter((e) => e.project === filter || e.cwd === filter || e.cwd.endsWith(`/${filter}`))
    : entries;

  const counts: Partial<Record<SessionStateName, number>> = {};
  for (const s of sessions) counts[s.state] = (counts[s.state] ?? 0) + 1;

  for (const state of AGGREGATE_PRIORITY) {
    if ((counts[state] ?? 0) > 0) return { state, sessions, counts };
  }
  return { state: sessions.length === 0 ? "unknown" : "unknown", sessions, counts };
}

/**
 * Watches state.json written by the Claude Code hook. Event-driven via fs.watch
 * (debounced), with a slow fallback poll and a periodic decay check so a killed
 * session can't stick as "working".
 */
export class StateWatcher {
  private readonly dir: string;
  private readonly file: string;
  private readonly decayMs: number;
  private readonly pollMs: number;
  private readonly decayCheckMs: number;
  private readonly now: () => number;
  private readonly logger?: Logger;
  private readonly listeners = new Set<(entries: SessionEntry[]) => void>();
  private watcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private decayTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private rawEntries: SessionEntry[] = [];
  private lastEmittedKey = "";
  private started = false;

  constructor(
    opts: {
      dir?: string;
      decayMs?: number;
      pollMs?: number;
      decayCheckMs?: number;
      debounceMs?: number;
      now?: () => number;
      logger?: Logger;
    } = {},
  ) {
    this.dir = opts.dir ?? DEFAULT_STATE_DIR;
    this.file = path.join(this.dir, STATE_FILE_NAME);
    this.decayMs = opts.decayMs ?? DEFAULT_DECAY_MS;
    this.pollMs = opts.pollMs ?? 10_000;
    this.decayCheckMs = opts.decayCheckMs ?? 5_000;
    this.debounceMs = opts.debounceMs ?? 150;
    this.now = opts.now ?? Date.now;
    this.logger = opts.logger;
  }
  private readonly debounceMs: number;

  onChange(cb: (entries: SessionEntry[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Current entries with decay applied. */
  getEntries(): SessionEntry[] {
    const nowMs = this.now();
    return this.rawEntries.map((e) => applyDecay(e, nowMs, this.decayMs));
  }

  aggregate(projectFilter?: string): AggregateState {
    return aggregateStates(this.getEntries(), projectFilter);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      await fs.mkdir(this.dir, { recursive: true });
      this.watcher = watch(this.dir, () => this.scheduleReload());
      this.watcher.on("error", (err) => this.logger?.warn(`state watch error: ${String(err)}`));
    } catch (err) {
      this.logger?.warn(`fs.watch unavailable, falling back to polling: ${String(err)}`);
    }
    this.pollTimer = setInterval(() => void this.reload(), this.pollMs);
    this.decayTimer = setInterval(() => this.emitIfChanged(), this.decayCheckMs);
    await this.reload();
  }

  stop(): void {
    this.started = false;
    this.watcher?.close();
    this.watcher = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.decayTimer) clearInterval(this.decayTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.pollTimer = this.decayTimer = null;
    this.debounceTimer = null;
  }

  /** Force an immediate re-read (e.g. key press). */
  async refresh(): Promise<void> {
    await this.reload();
  }

  private scheduleReload(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.reload(), this.debounceMs);
  }

  private async reload(): Promise<void> {
    let text: string | null = null;
    try {
      text = await fs.readFile(this.file, "utf8");
    } catch {
      text = null; // missing file → no sessions → "unknown"
    }
    this.rawEntries = parseStateFile(text);
    this.emitIfChanged();
  }

  private emitIfChanged(): void {
    const entries = this.getEntries();
    const key = JSON.stringify(entries.map((e) => [e.sessionId, e.state, e.lastActivity]));
    if (key === this.lastEmittedKey) return;
    this.lastEmittedKey = key;
    for (const cb of this.listeners) {
      try {
        cb(entries);
      } catch (err) {
        this.logger?.warn(`state listener threw: ${String(err)}`);
      }
    }
  }
}
