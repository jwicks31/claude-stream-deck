# Claude Deck — Stream Deck plugin for Claude Code

A Stream Deck plugin (`com.articulate.claude-usage.sdPlugin`) that puts Claude Code
usage, live session state, and workflow controls on physical keys and dials.

## Actions

| Action | UUID (suffix) | Controller | What it does |
|---|---|---|---|
| Usage Tile | `.usage` | Keypad | Shows cost/tokens for a scope: active 5h block, today, last-7-days, or month-to-date. Press = force refresh. |
| Session State | `.session-state` | Keypad | Live Claude Code session state via hooks: idle / working / waiting / done / offline. Filter by project or aggregate across all sessions. Press = force re-read. |
| Skill Dial | `.skill-dial` | Encoder | Rotate to pick a skill/workflow from a configurable list (`/review-pr`, `/debug`, `/refactor`, …); press to type it into your terminal. |
| Command Key | `.command-key` | Keypad | One dedicated shortcut: accept (Enter), reject (Esc), new chat (`/clear`), or custom text. |
| Reasoning Dial | `.reasoning-dial` | Encoder | Rotate to pick a thinking level (`think` → `ultrathink`, configurable); press to type it. |

## Data sources

### Usage — ccusage (bundled)

ccusage ≥ 20 has **no programmatic API** — `ccusage` on npm is a launcher
(`src/cli.js`) that resolves and spawns a per-platform native binary from
`@ccusage/ccusage-<platform>-<arch>`. Verified against ccusage `20.0.17`.

Therefore `CcusageSource` **spawns** the CLI, resolving in order:

1. The platform binary bundled inside the plugin (`bin/ccusage/…`), copied at build time.
2. The bundled launcher `cli.js` run with the plugin's own Node (`process.execPath`).
3. A user-configured command override (Property Inspector).
4. `ccusage` on `PATH`.

One tick issues two invocations that feed **all** visible tiles:

- `daily --json --since <month-start-of-(now-7d)>` → normalized into `today`, `week`
  (last 7 calendar days incl. today), `month` (calendar month-to-date).
- `blocks --json` → the active 5h block (`isActive: true`): cost, tokens, burn rate,
  projection, time remaining.

Normalization is pure (`normalize.ts`) and tested against recorded real fixtures in
`test/fixtures/ccusage/`.

### Session state — Claude Code hooks

A dependency-free hook script (`hooks/claude-state-hook.mjs`) is registered for
lifecycle events and maps them to states, written atomically (temp file + rename)
to `~/.claude/streamdeck-usage/state.json`:

| Event | State |
|---|---|
| `SessionStart` | `idle` |
| `UserPromptSubmit`, `PreToolUse`, `PostToolUse` | `working` |
| `Notification` | `waiting` |
| `Stop` | `done` |
| `SessionEnd` | `offline` |

`state.json` is a map keyed by `session_id`; each entry carries `cwd`, `project`
(basename of cwd), `state`, `lastActivity`, `updatedAt`. Entries older than 24h are
pruned on write. The script always exits 0 and never blocks Claude Code.

`StateWatcher` (plugin side) uses `fs.watch` on the state dir (debounced ~150ms)
plus a slow fallback poll (10s), tolerates missing/corrupt/partial files
(state = `unknown`), and applies a decay: `working` with no update in 90s is
treated as `idle` so a killed session can't stick as "working".

Aggregation (no project filter): any `working` → working, else any `waiting` →
waiting, else any `done` → done, else any `idle` → idle, else offline/unknown.

### Hook installation

The Session State PI has **Enable / Remove live session state** buttons plus an
installed/not-installed status. Install path: read `~/.claude/settings.json` →
back it up (`settings.json.claude-deck-backup-<ts>`) → merge our hook entries
(never clobbering existing hooks; our entries are identified by the hook script
path in the command) → write atomically. Remove pulls only our entries. A corrupt
settings.json aborts with a clear PI message; nothing is written.

## Refresh cadence

Tiered polling, one poller shared by all tiles:

- block tier: every 30s (configurable 10–300s per tile; poller uses min of visible tiles)
- today tier: every 60s
- week/month tier: every 5min

The poller pauses when no usage tiles are visible (`willAppear`/`willDisappear`
refcount), a key press forces an immediate refresh, errors back off exponentially
(×2 up to 5min) and tiles keep the last-good value with a stale marker (`⚠`).

## Typing into the terminal (macOS)

Skill Dial / Command Key / Reasoning Dial send text via
`osascript` (System Events keystroke), optionally activating a configured
terminal app first (default: frontmost app). Requires granting Stream Deck
**Accessibility** permission on first use. Windows is out of scope for the
typing actions in v1 (tiles work everywhere).

## Rendering

Keys render as inline SVG via `setImage` (data URI): title, big value, subtitle,
state color band, stale marker. Encoders use the `$B1` layout via
`setFeedback` (title/value) plus `setImage` for the dial icon.

## Packaging & distribution

- Built with esbuild → `com.articulate.claude-usage.sdPlugin/bin/plugin.mjs`
  (single ESM bundle; `@elgato/streamdeck` bundled in).
- Build copies the hook script and the ccusage launcher + darwin binaries into the
  `.sdPlugin` bundle so teammates install nothing extra.
- `npm run pack` produces `claude-deck.streamDeckPlugin` (zip) attachable to a
  GitHub Release; teammates double-click to install. No Marketplace submission.

## Error handling

- ccusage missing/slow/erroring → last-good value + stale marker, backoff retry,
  never crash; structured logging via the SDK logger.
- No `~/.claude` data → "no data" tile.
- `state.json` missing/corrupt → `unknown` state; partial writes tolerated.
- settings.json merge → backup + JSON validation; abort with a PI message rather
  than clobber.

## Testing (real-over-mocks)

- `normalize.test.ts` — against recorded real `ccusage --json` fixtures.
- `formatters.test.ts` — pure functions ($ and token humanization, durations).
- `state-watcher.test.ts` — real temp state files; transitions + decay via injected clock.
- `hook-script.test.ts` — spawns the real hook script with simulated Claude Code
  stdin events against a temp dir; asserts file contents and atomicity.
- `hook-installer.test.ts` — real temp settings.json files: fresh install, merge with
  existing hooks, idempotency, corrupt-file abort, removal.
- `render-model.test.ts` — pure view-model builders for tiles/dials.
- Final verification = load the unpacked plugin in the Stream Deck app and drive a
  real Claude Code session.
