import { action } from "@elgato/streamdeck";
import { ListDialAction } from "./list-dial.js";

/**
 * Rotate to pick a thinking level, press to type it. Defaults use Claude Code's
 * thinking keywords; fully configurable for setups that prefer slash commands.
 */
@action({ UUID: "com.articulate.claude-usage.reasoning-dial" })
export class ReasoningDialAction extends ListDialAction {
  protected readonly feedbackTitle = "Reasoning";
  protected readonly defaultItems = ["think", "think hard", "think harder", "ultrathink"];
  protected readonly defaultPressEnter = false;
}
