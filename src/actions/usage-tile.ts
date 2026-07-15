import { action, SingletonAction, type KeyAction, type WillAppearEvent, type WillDisappearEvent, type KeyDownEvent, type DidReceiveSettingsEvent } from "@elgato/streamdeck";
import { svgToDataUri, tileSvg, usageTileModel } from "../core/render.js";
import type { UsageMetric, UsageScope } from "../core/types.js";
import type { UsagePoller, PollerUpdate } from "../core/usage-poller.js";

export type UsageTileSettings = {
  scope?: UsageScope;
  metric?: UsageMetric;
  refreshSeconds?: number;
};

const SCOPES: UsageScope[] = ["block", "today", "week", "month"];

@action({ UUID: "com.articulate.claude-usage.usage" })
export class UsageTileAction extends SingletonAction<UsageTileSettings> {
  constructor(private readonly poller: UsagePoller) {
    super();
    this.poller.onUpdate((update) => void this.paintAll(update));
  }

  override async onWillAppear(ev: WillAppearEvent<UsageTileSettings>): Promise<void> {
    const settings = ev.payload.settings;
    this.poller.addRef(ev.action.id, settings.refreshSeconds);
    if (ev.action.isKey()) await this.paint(ev.action, settings, this.poller.current);
  }

  override onWillDisappear(ev: WillDisappearEvent<UsageTileSettings>): void {
    this.poller.removeRef(ev.action.id);
  }

  override async onKeyDown(ev: KeyDownEvent<UsageTileSettings>): Promise<void> {
    this.poller.forceRefresh();
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<UsageTileSettings>): Promise<void> {
    this.poller.addRef(ev.action.id, ev.payload.settings.refreshSeconds);
    if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings, this.poller.current);
  }

  private async paintAll(update: PollerUpdate): Promise<void> {
    for (const a of this.actions) {
      if (!a.isKey()) continue;
      const settings = await a.getSettings();
      await this.paint(a, settings, update);
    }
  }

  private async paint(
    a: KeyAction<UsageTileSettings>,
    settings: UsageTileSettings,
    update: PollerUpdate,
  ): Promise<void> {
    const scope = SCOPES.includes(settings.scope as UsageScope) ? (settings.scope as UsageScope) : "block";
    const metric: UsageMetric = settings.metric === "tokens" ? "tokens" : "cost";
    const model = usageTileModel(update.snapshot, scope, metric, update.stale);
    await a.setImage(svgToDataUri(tileSvg(model)));
  }
}
