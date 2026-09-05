import fs from "node:fs/promises";
import path from "node:path";
import { creamTheme } from "../shared/terminal-themes.js";

// Windows Terminal uses JSON with comments and trailing commas. Keep strings intact.
export function parseSettings(text) {
  return JSON.parse(
    text
      .replace(/^\uFEFF/, "")
      .replace(
        /("(?:\\.|[^"\\])*")|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
        (m, s) => s || " ",
      )
      .replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g, (m, s, end) => s || end),
  );
}
const map = {
  cursorColor: "cursor",
  purple: "magenta",
  brightPurple: "brightMagenta",
};
function colors(source) {
  return Object.fromEntries(
    Object.entries(source || {}).flatMap(([key, value]) => {
      const target = map[key] || key;
      return target in creamTheme &&
        typeof value === "string" &&
        /^#[\da-f]{6}$/i.test(value)
        ? [[target, value]]
        : [];
    }),
  );
}
export function windowsTheme(settings, profileId, appearance = "light") {
  const profile =
    settings.profiles?.list?.find(
      (p) => p.guid === (profileId || settings.defaultProfile),
    ) || {};
  const defaults = settings.profiles?.defaults || {};
  const choice = profile.colorScheme ?? defaults.colorScheme;
  const name = typeof choice === "string" ? choice : choice?.[appearance];
  const scheme = settings.schemes?.find((s) => s.name === name);
  // Unresolved built-in schemes must not be presented as successfully imported.
  if (!scheme) return null;
  const theme = { ...colors(scheme), ...colors(defaults), ...colors(profile) };
  if (!theme.background || !theme.foreground) return null;
  return {
    name: String(name).slice(0, 80),
    source: "windows-terminal",
    colors: theme,
  };
}
export async function terminalTheme({ file, profile, appearance } = {}) {
  const base = process.env.LOCALAPPDATA;
  const candidates = file
    ? [file]
    : process.platform === "win32" && base
      ? [
          path.join(
            base,
            "Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json",
          ),
          path.join(base, "Microsoft/Windows Terminal/settings.json"),
          path.join(
            base,
            "Packages/Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe/LocalState/settings.json",
          ),
        ]
      : [];
  for (const candidate of candidates) {
    try {
      const result = windowsTheme(
        parseSettings(await fs.readFile(candidate, "utf8")),
        profile,
        appearance,
      );
      if (result) return result;
    } catch {
      /* A missing or malformed host setting must not prevent startup. */
    }
  }
  return { name: "奶油黄", source: "fallback", colors: creamTheme };
}
