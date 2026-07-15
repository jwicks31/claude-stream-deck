import {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { promises as fs } from "node:fs";
import { installHooks, isHookInstalled, removeHooks } from "../core/hook-installer.js";
import { sessionTileModel, sessionTileSvg, svgToDataUri } from "../core/render.js";
import type { StateWatcher } from "../core/state-watcher.js";

export type SessionStateSettings = {
  projectFilter?: string;
};

type HookManager = {
  settingsPath: string;
  scriptPath: string;
};

@action({ UUID: "com.articulate.claude-usage.session-state" })
export class SessionStateAction extends SingletonAction<SessionStateSettings> {
  private visible = 0;

  constructor(
    private readonly watcher: StateWatcher,
    private readonly hookManager: HookManager,
    private readonly ui: { sendToPropertyInspector(payload: JsonValue): Promise<void> },
  ) {
    super();
    this.watcher.onChange(() => void this.paintAll());
  }

  override async onWillAppear(ev: WillAppearEvent<SessionStateSettings>): Promise<void> {
    this.visible++;
    if (this.visible === 1) await this.watcher.start();
    if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
  }

  override onWillDisappear(_ev: WillDisappearEvent<SessionStateSettings>): void {
    this.visible = Math.max(0, this.visible - 1);
    if (this.visible === 0) this.watcher.stop();
  }

  override async onKeyDown(_ev: KeyDownEvent<SessionStateSettings>): Promise<void> {
    await this.watcher.refresh();
    await this.paintAll();
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SessionStateSettings>): Promise<void> {
    if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
  }

  /** PI messages: hook install / remove / status. */
  override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, SessionStateSettings>): Promise<void> {
    const payload = ev.payload as { event?: string } | null;
    const { settingsPath, scriptPath } = this.hookManager;
    switch (payload?.event) {
      case "hook-status":
        await this.sendStatus();
        break;
      case "hook-install": {
        const result = await installHooks(settingsPath, scriptPath);
        await this.sendStatus(result.ok ? undefined : result.error, result.ok ? result.backupPath : undefined);
        break;
      }
      case "hook-remove": {
        const result = await removeHooks(settingsPath, scriptPath);
        await this.sendStatus(result.ok ? undefined : result.error, result.ok ? result.backupPath : undefined);
        break;
      }
    }
  }

  private async sendStatus(error?: string, backupPath?: string): Promise<void> {
    let installed = false;
    try {
      const text = await fs.readFile(this.hookManager.settingsPath, "utf8");
      installed = isHookInstalled(JSON.parse(text), this.hookManager.scriptPath);
    } catch {
      installed = false;
    }
    await this.ui.sendToPropertyInspector({
      event: "hook-status",
      installed,
      error: error ?? null,
      backupPath: backupPath ?? null,
      settingsPath: this.hookManager.settingsPath,
    });
  }

  private async paintAll(): Promise<void> {
    for (const a of this.actions) {
      if (!a.isKey()) continue;
      await this.paint(a, await a.getSettings());
    }
  }

  private async paint(a: KeyAction<SessionStateSettings>, settings: SessionStateSettings): Promise<void> {
    const agg = this.watcher.aggregate(settings.projectFilter);
    const model = sessionTileModel(agg, settings.projectFilter);
    await a.setImage(svgToDataUri(sessionTileSvg(model)));
  }
}
