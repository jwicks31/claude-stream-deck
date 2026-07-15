#!/usr/bin/env node
/**
 * Claude Deck session-state hook for Claude Code.
 *
 * Registered (opt-in, via the plugin's Property Inspector) for lifecycle events
 * in ~/.claude/settings.json. Reads the hook event JSON from stdin, maps it to
 * a session state, and atomically updates state.json (temp file + rename) in
 * ~/.claude/streamdeck-usage/ (override with CLAUDE_DECK_STATE_DIR).
 *
 * Dependency-free, always exits 0, never blocks Claude Code.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

const EVENT_STATES = {
  SessionStart: "idle",
  UserPromptSubmit: "working",
  PreToolUse: "working",
  PostToolUse: "working",
  Notification: "waiting",
  Stop: "done",
  SessionEnd: "offline",
};

const ACTIVITY_EVENTS = new Set(["UserPromptSubmit", "PreToolUse", "PostToolUse"]);
const PRUNE_MS = 24 * 60 * 60 * 1000;

function readStdin(timeoutMs = 3000) {
  return new Promise((resolve) => {
    const chunks = [];
    const timer = setTimeout(() => resolve(Buffer.concat(chunks).toString("utf8")), timeoutMs);
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    process.stdin.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
  });
}

function loadState(file) {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (data && typeof data === "object" && data.sessions && typeof data.sessions === "object") {
      return { version: 1, sessions: data.sessions };
    }
  } catch {
    // missing or corrupt → start fresh
  }
  return { version: 1, sessions: {} };
}

async function main() {
  const raw = await readStdin();
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }
  if (!event || typeof event !== "object") return;

  const eventName = event.hook_event_name;
  const state = EVENT_STATES[eventName];
  const sessionId = typeof event.session_id === "string" ? event.session_id : "";
  if (!state || !sessionId) return;

  const dir = process.env.CLAUDE_DECK_STATE_DIR || join(homedir(), ".claude", "streamdeck-usage");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "state.json");

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const stateFile = loadState(file);
  const prev = stateFile.sessions[sessionId] || {};
  const cwd = typeof event.cwd === "string" && event.cwd ? event.cwd : prev.cwd || "";

  stateFile.sessions[sessionId] = {
    sessionId,
    state,
    cwd,
    project: cwd ? basename(cwd) : prev.project || "",
    model: typeof event.model === "string" ? event.model : prev.model,
    lastActivity: ACTIVITY_EVENTS.has(eventName) || !prev.lastActivity ? nowIso : prev.lastActivity,
    updatedAt: nowIso,
  };

  for (const [id, entry] of Object.entries(stateFile.sessions)) {
    const ts = Date.parse(entry?.updatedAt ?? "");
    if (!Number.isFinite(ts) || nowMs - ts > PRUNE_MS) delete stateFile.sessions[id];
  }

  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(stateFile, null, 1));
  renameSync(tmp, file);
}

main()
  .catch(() => {})
  .finally(() => process.exit(0));
