import { execFile } from "node:child_process";

/** macOS virtual key codes for the special keys we support. */
export const KEY_CODES = { return: 36, escape: 53, tab: 48 } as const;
export type SpecialKey = keyof typeof KEY_CODES;

export type KeystrokeStep = { type: "text"; value: string } | { type: "key"; key: SpecialKey };

export function escapeForAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Build the AppleScript for a sequence of keystrokes, optionally activating a
 * terminal app first (default: whatever is frontmost).
 */
export function buildKeystrokeScript(steps: KeystrokeStep[], appName?: string): string {
  const lines: string[] = [];
  if (appName && appName.trim()) {
    lines.push(`tell application ${JSON.stringify(appName.trim())} to activate`);
    lines.push("delay 0.2");
  }
  lines.push('tell application "System Events"');
  for (const step of steps) {
    if (step.type === "text") {
      if (step.value.length > 0) lines.push(`  keystroke "${escapeForAppleScript(step.value)}"`);
    } else {
      lines.push(`  key code ${KEY_CODES[step.key]}`);
    }
  }
  lines.push("end tell");
  return lines.join("\n");
}

export type TypeResult = { ok: true } | { ok: false; error: string };

/**
 * Send keystrokes via osascript (macOS only). Requires the Stream Deck app to
 * have Accessibility permission; the error message says so when it doesn't.
 */
export function sendKeystrokes(steps: KeystrokeStep[], appName?: string): Promise<TypeResult> {
  if (process.platform !== "darwin") {
    return Promise.resolve({ ok: false, error: "Typing actions are macOS-only in this version." });
  }
  if (steps.length === 0) return Promise.resolve({ ok: true });
  const script = buildKeystrokeScript(steps, appName);
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], { timeout: 10_000 }, (error, _stdout, stderr) => {
      if (!error) return resolve({ ok: true });
      const detail = String(stderr || error.message);
      const hint = detail.includes("not allowed") || detail.includes("1002")
        ? " Grant Stream Deck Accessibility permission in System Settings → Privacy & Security → Accessibility."
        : "";
      resolve({ ok: false, error: `osascript failed: ${detail.trim()}${hint}` });
    });
  });
}
