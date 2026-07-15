import { action } from "@elgato/streamdeck";
import { ListDialAction } from "./list-dial.js";

/** Rotate to pick a Claude Code skill/workflow, press to type it into the terminal. */
@action({ UUID: "com.articulate.claude-usage.skill-dial" })
export class SkillDialAction extends ListDialAction {
  protected readonly feedbackTitle = "Skill";
  protected readonly defaultItems = ["/code-review", "/debug", "/explore", "/test", "/pr-description"];
  protected readonly defaultPressEnter = false;
}
