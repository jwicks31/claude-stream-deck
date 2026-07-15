import { describe, expect, it } from "vitest";
import { buildKeystrokeScript, escapeForAppleScript } from "../src/core/keystrokes.js";
// NOTE: tests import pure core modules, not src/actions/* — the decorated
// action classes only load inside Stream Deck (vitest's oxc transform does not
// lower TC39 decorators for Node).
import { stepsForCommand } from "../src/core/commands.js";
import { parseItems, rotateIndex } from "../src/actions/list-dial.js";

describe("escapeForAppleScript", () => {
  it("escapes quotes and backslashes", () => {
    expect(escapeForAppleScript('say "hi" \\ bye')).toBe('say \\"hi\\" \\\\ bye');
  });
});

describe("buildKeystrokeScript", () => {
  it("types text and presses keys inside System Events", () => {
    const script = buildKeystrokeScript(
      [{ type: "text", value: "/code-review" }, { type: "key", key: "return" }],
    );
    expect(script).toContain('tell application "System Events"');
    expect(script).toContain('keystroke "/code-review"');
    expect(script).toContain("key code 36");
    expect(script).not.toContain("activate");
  });

  it("activates the terminal app first when configured", () => {
    const script = buildKeystrokeScript([{ type: "text", value: "x" }], "iTerm");
    expect(script.startsWith('tell application "iTerm" to activate')).toBe(true);
    expect(script).toContain("delay");
  });
});

describe("stepsForCommand", () => {
  it("maps presets to keystroke sequences", () => {
    expect(stepsForCommand({ preset: "accept" })).toEqual([{ type: "key", key: "return" }]);
    expect(stepsForCommand({ preset: "reject" })).toEqual([{ type: "key", key: "escape" }]);
    expect(stepsForCommand({ preset: "new-chat" })).toEqual([
      { type: "text", value: "/clear" },
      { type: "key", key: "return" },
    ]);
    expect(stepsForCommand({ preset: "custom", customText: "/compact", pressEnter: true })).toEqual([
      { type: "text", value: "/compact" },
      { type: "key", key: "return" },
    ]);
    expect(stepsForCommand({ preset: "custom" })).toEqual([]);
    expect(stepsForCommand({})).toEqual([{ type: "key", key: "return" }]); // default = accept
  });
});

describe("list dial helpers", () => {
  it("parses the PI textarea and falls back to defaults", () => {
    expect(parseItems("/a\n\n  /b  \n", ["/x"])).toEqual(["/a", "/b"]);
    expect(parseItems("", ["/x"])).toEqual(["/x"]);
    expect(parseItems(undefined, ["/x"])).toEqual(["/x"]);
  });

  it("wraps rotation in both directions", () => {
    expect(rotateIndex(0, 1, 3)).toBe(1);
    expect(rotateIndex(2, 1, 3)).toBe(0);
    expect(rotateIndex(0, -1, 3)).toBe(2);
    expect(rotateIndex(undefined, -2, 3)).toBe(1);
    expect(rotateIndex(5, 0, 3)).toBe(2);
    expect(rotateIndex(0, 1, 0)).toBe(0);
  });
});
