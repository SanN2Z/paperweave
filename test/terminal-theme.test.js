import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSettings,
  windowsTheme,
  terminalTheme,
} from "../server/terminal-theme.js";

test("Windows Terminal profile precedence and ANSI mapping never expose unrelated settings", () => {
  const settings = parseSettings(`{
    // Color names and URLs must survive comments and trailing commas.
    "defaultProfile": "one", "profiles": {
      "defaults": {"colorScheme": "cream//warm", "foreground": "#123456"},
      "list": [{"guid": "one", "background": "#E7DBB4", "commandline": "private command"},
        {"guid": "two", "colorScheme": {"light": "cream//warm", "dark": "unknown"}}],
    }, /* comment */
    "schemes": [{"name": "cream//warm", "background": "#FFFFFF", "foreground": "#000000",
      "cursorColor": "#A9852F", "purple": "#C13682", "brightPurple": "#6C71C4", "red": "invalid",}],
  }`);
  const result = windowsTheme(settings);
  assert.deepEqual(result.colors, {
    background: "#E7DBB4",
    foreground: "#123456",
    cursor: "#A9852F",
    magenta: "#C13682",
    brightMagenta: "#6C71C4",
  });
  assert.ok(!JSON.stringify(result).includes("private command"));
  assert.equal(
    windowsTheme(settings, "two", "light").colors.background,
    "#FFFFFF",
  );
  assert.equal(windowsTheme(settings, "two", "dark"), null);
});

test("unavailable host settings fall back without claiming a local import", async () => {
  const result = await terminalTheme({
    file: "missing-terminal-settings-fixture.json",
  });
  assert.equal(result.source, "fallback");
  assert.equal(result.colors.background, "#E7DBB4");
});
