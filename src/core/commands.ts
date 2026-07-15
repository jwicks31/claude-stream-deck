import type { KeystrokeStep } from "./keystrokes.js";

export type CommandPreset = "accept" | "reject" | "new-chat" | "custom";

export type CommandKeySettings = {
  preset?: CommandPreset;
  customText?: string;
  pressEnter?: boolean;
  terminalApp?: string;
};

/** Map a command-key configuration to the keystroke sequence it sends. */
export function stepsForCommand(settings: CommandKeySettings): KeystrokeStep[] {
  switch (settings.preset ?? "accept") {
    case "accept":
      return [{ type: "key", key: "return" }];
    case "reject":
      return [{ type: "key", key: "escape" }];
    case "new-chat":
      return [{ type: "text", value: "/clear" }, { type: "key", key: "return" }];
    case "custom": {
      const text = settings.customText ?? "";
      if (!text) return [];
      const steps: KeystrokeStep[] = [{ type: "text", value: text }];
      if (settings.pressEnter) steps.push({ type: "key", key: "return" });
      return steps;
    }
  }
}
