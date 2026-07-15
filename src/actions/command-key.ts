import {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { stepsForCommand, type CommandKeySettings } from "../core/commands.js";
import { sendKeystrokes } from "../core/keystrokes.js";
import { commandKeyModel, commandKeySvg, svgToDataUri } from "../core/render.js";

export type { CommandKeySettings, CommandPreset } from "../core/commands.js";

/** A dedicated key for one core action: accept, reject, new chat, or custom text. */
@action({ UUID: "com.articulate.claude-usage.command-key" })
export class CommandKeyAction extends SingletonAction<CommandKeySettings> {
  constructor(private readonly type: typeof sendKeystrokes = sendKeystrokes) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<CommandKeySettings>): Promise<void> {
    if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CommandKeySettings>): Promise<void> {
    if (ev.action.isKey()) await this.paint(ev.action, ev.payload.settings);
  }

  override async onKeyDown(ev: KeyDownEvent<CommandKeySettings>): Promise<void> {
    const steps = stepsForCommand(ev.payload.settings);
    if (steps.length === 0) return;
    const result = await this.type(steps, ev.payload.settings.terminalApp);
    if (result.ok) await ev.action.showOk();
    else await ev.action.showAlert();
  }

  private async paint(a: KeyAction<CommandKeySettings>, settings: CommandKeySettings): Promise<void> {
    const model = commandKeyModel(settings.preset, settings.customText);
    await a.setImage(svgToDataUri(commandKeySvg(model)));
  }
}
