import {
  SingletonAction,
  type DialAction,
  type DialDownEvent,
  type DialRotateEvent,
  type TouchTapEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import { sendKeystrokes, type KeystrokeStep } from "../core/keystrokes.js";

export type ListDialSettings = {
  /** Newline-separated options shown on the dial. */
  items?: string;
  selectedIndex?: number;
  terminalApp?: string;
  pressEnter?: boolean;
};

/** Parse the newline-separated PI textarea into a clean list. */
export function parseItems(raw: string | undefined, fallback: string[]): string[] {
  const items = (raw ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return items.length > 0 ? items : fallback;
}

/** Wrap-around index arithmetic for dial rotation. */
export function rotateIndex(current: number | undefined, ticks: number, length: number): number {
  if (length <= 0) return 0;
  const base = Number.isInteger(current) ? (current as number) : 0;
  return ((base + ticks) % length + length) % length;
}

/**
 * Shared behavior for "rotate to pick, press to type" encoders (Skill Dial,
 * Reasoning Dial). Subclasses supply defaults and the feedback title.
 */
export abstract class ListDialAction extends SingletonAction<ListDialSettings> {
  protected abstract readonly feedbackTitle: string;
  protected abstract readonly defaultItems: string[];
  protected abstract readonly defaultPressEnter: boolean;

  constructor(protected readonly type: (steps: KeystrokeStep[], app?: string) => ReturnType<typeof sendKeystrokes> = sendKeystrokes) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<ListDialSettings>): Promise<void> {
    if (ev.action.isDial()) await this.showSelection(ev.action, ev.payload.settings);
  }

  override async onDialRotate(ev: DialRotateEvent<ListDialSettings>): Promise<void> {
    const settings = ev.payload.settings;
    const items = parseItems(settings.items, this.defaultItems);
    const selectedIndex = rotateIndex(settings.selectedIndex, ev.payload.ticks, items.length);
    const next = { ...settings, selectedIndex };
    await ev.action.setSettings(next);
    await this.showSelection(ev.action, next);
  }

  override async onDialDown(ev: DialDownEvent<ListDialSettings>): Promise<void> {
    await this.fire(ev.action, ev.payload.settings);
  }

  override async onTouchTap(ev: TouchTapEvent<ListDialSettings>): Promise<void> {
    await this.fire(ev.action, ev.payload.settings);
  }

  protected selected(settings: ListDialSettings): string {
    const items = parseItems(settings.items, this.defaultItems);
    return items[rotateIndex(settings.selectedIndex, 0, items.length)] ?? "";
  }

  private async showSelection(a: DialAction<ListDialSettings>, settings: ListDialSettings): Promise<void> {
    await a.setFeedback({ title: this.feedbackTitle, value: this.selected(settings) });
  }

  private async fire(a: DialAction<ListDialSettings>, settings: ListDialSettings): Promise<void> {
    const text = this.selected(settings);
    if (!text) return;
    const steps: KeystrokeStep[] = [{ type: "text", value: text }];
    if (settings.pressEnter ?? this.defaultPressEnter) steps.push({ type: "key", key: "return" });
    const result = await this.type(steps, settings.terminalApp);
    if (!result.ok) await a.showAlert();
  }
}
