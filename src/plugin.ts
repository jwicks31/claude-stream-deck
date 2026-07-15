import streamDeck from "@elgato/streamdeck";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CommandKeyAction } from "./actions/command-key.js";
import { ReasoningDialAction } from "./actions/reasoning-dial.js";
import { SessionStateAction } from "./actions/session-state.js";
import { SkillDialAction } from "./actions/skill-dial.js";
import { UsageTileAction } from "./actions/usage-tile.js";
import { fetchSnapshot, makeCcusageRunner, resolveCcusageInvocation } from "./core/ccusage-source.js";
import { DEFAULT_SETTINGS_PATH } from "./core/hook-installer.js";
import { StateWatcher } from "./core/state-watcher.js";
import { UsagePoller } from "./core/usage-poller.js";

const logger = streamDeck.logger.createScope("claude-deck");

// bin/plugin.mjs → plugin root is one level up.
const binDir = path.dirname(fileURLToPath(import.meta.url));
const pluginDir = path.resolve(binDir, "..");

const invocation = resolveCcusageInvocation(pluginDir);
logger.info(`ccusage via: ${invocation.cmd} ${invocation.baseArgs.join(" ")}`);
const run = makeCcusageRunner(invocation);

const poller = new UsagePoller({
  fetch: (now) => fetchSnapshot(run, now, logger),
  logger,
});

const watcher = new StateWatcher({ logger });

const hookManager = {
  settingsPath: DEFAULT_SETTINGS_PATH,
  scriptPath: path.join(binDir, "claude-state-hook.mjs"),
};

streamDeck.actions.registerAction(new UsageTileAction(poller));
streamDeck.actions.registerAction(new SessionStateAction(watcher, hookManager, streamDeck.ui));
streamDeck.actions.registerAction(new SkillDialAction());
streamDeck.actions.registerAction(new ReasoningDialAction());
streamDeck.actions.registerAction(new CommandKeyAction());

process.on("uncaughtException", (err) => logger.error(`uncaught: ${String(err?.stack ?? err)}`));
process.on("unhandledRejection", (err) => logger.error(`unhandled rejection: ${String(err)}`));

await streamDeck.connect();
logger.info("claude-deck connected");
