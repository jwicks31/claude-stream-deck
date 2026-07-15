# Claude Deck

Claude Code on your Stream Deck: usage cost/token tiles (via bundled [ccusage](https://github.com/ccusage/ccusage)), live session state via Claude Code hooks, and dials/keys that drive your Claude workflow. See [SPEC.md](SPEC.md) for the full design.

## Actions

- **Usage Tile** (key) — spend or tokens for the active 5h block (with time left + projected cost), today, last 7 days, or month-to-date. Press to refresh now.
- **Session State** (key) — idle / working / waiting / done per project or aggregated across all Claude Code sessions. Working sessions that go quiet for 90s decay to idle.
- **Skill Dial** (Stream Deck + dial) — rotate to pick a workflow (`/code-review`, `/debug`, …), press to type it into your terminal.
- **Command Key** (key) — accept (Enter), reject (Esc), new chat (`/clear`), or custom text.
- **Reasoning Dial** (dial) — rotate through thinking levels (`think` → `ultrathink`), press to type.

## Install (teammates)

1. Download `claude-deck.streamDeckPlugin` from the latest GitHub Release.
2. Double-click it — the Stream Deck app installs it. That's it; ccusage is bundled.
3. Drag actions onto keys/dials.
4. For **Session State**: select the tile → click **Enable live session state** in the property inspector. This merges state-reporting hooks into `~/.claude/settings.json` (a timestamped backup is written first; **Remove** undoes it).
5. For the typing actions (Skill/Command/Reasoning): macOS will prompt to grant **Stream Deck** Accessibility permission (System Settings → Privacy & Security → Accessibility).

## Develop

```bash
npm install
npm test          # vitest — fixtures recorded from real ccusage output
npm run typecheck
npm run build     # bundles to com.articulate.claude-usage.sdPlugin/bin
npm run pack      # → dist/claude-deck.streamDeckPlugin
```

To iterate locally, symlink the bundle into Stream Deck's plugin folder and restart the Stream Deck app:

```bash
ln -s "$PWD/com.articulate.claude-usage.sdPlugin" \
  "$HOME/Library/Application Support/com.elgato.StreamDeck/Plugins/"
```

Plugin logs: Stream Deck writes them under `~/Library/Logs/ElgatoStreamDeck/` (the plugin logs through the SDK logger).

## How it works

- **Usage**: one shared poller spawns the bundled ccusage binary (`blocks --json` + `daily --json`) per tick — one tick feeds all tiles. Polling pauses when no tiles are visible; errors keep the last-good value with a ⚠ stale marker and back off exponentially.
- **Session state**: a tiny dependency-free hook script (`bin/claude-state-hook.mjs`) maps Claude Code lifecycle events (SessionStart / UserPromptSubmit / Pre-PostToolUse / Notification / Stop / SessionEnd) to states and atomically writes `~/.claude/streamdeck-usage/state.json`, keyed by session. The plugin watches that file with `fs.watch` (near-instant) plus a slow fallback poll.
- **Typing actions**: `osascript` System Events keystrokes, optionally activating a configured terminal app first. macOS only.

## Known limits (v1)

- Typing actions are macOS-only; usage/session tiles are platform-neutral (a Windows ccusage binary can be bundled by building on Windows or adding the `@ccusage/ccusage-win32-*` packages).
- Push-to-talk isn't supported (needs key-down/up semantics osascript doesn't give us cleanly).
- No auto-update; install new releases manually.
