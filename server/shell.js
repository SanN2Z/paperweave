import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { parseSettings } from "./terminal-theme.js";

export async function resolveShell(config) {
  if (config.terminalShell || process.platform !== "win32")
    return shellCommand(config);
  const base = process.env.LOCALAPPDATA;
  const files = config.terminalThemeFile
    ? [config.terminalThemeFile]
    : base
      ? [
          path.join(
            base,
            "Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json",
          ),
          path.join(base, "Microsoft/Windows Terminal/settings.json"),
        ]
      : [];
  for (const file of files) {
    try {
      const settings = parseSettings(await fs.readFile(file, "utf8"));
      const profile = settings.profiles?.list?.find(
        (p) => p.guid === (config.terminalProfile || settings.defaultProfile),
      );
      let command = profile?.commandline;
      if (!command && profile?.source === "Windows.Terminal.PowershellCore") {
        const executable = path.join(
          process.env.ProgramFiles || "C:/Program Files",
          "PowerShell/7/pwsh.exe",
        );
        if (existsSync(executable)) command = `"${executable}"`;
      }
      if (command) {
        command = command.replace(
          /%([^%]+)%/g,
          (match, key) =>
            Object.entries(process.env).find(
              ([k]) => k.toLowerCase() === key.toLowerCase(),
            )?.[1] || match,
        );
        const parts =
          command
            .match(/(?:[^\s"]+|"[^"]*")+/g)
            ?.map((x) => x.replaceAll('"', "")) || [];
        if (parts.length)
          return shellCommand({
            ...config,
            terminalShell: parts[0],
            terminalShellArgs:
              config.terminalShellArgs ||
              (parts.length > 1 ? parts.slice(1) : undefined),
          });
      }
    } catch {}
  }
  return shellCommand(config);
}

export function terminalEnvironment(env, origin) {
  const copy = {
    ...env,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    FORCE_COLOR: "3",
    CLICOLOR: "1",
    TERM_PROGRAM: "Paperweave",
    PAPERWEAVE_URL: origin,
  };
  // This is an independent PTY. Do not inherit a parent Claude orchestration marker.
  delete copy.CLAUDECODE;
  delete copy.NO_COLOR;
  delete copy.CLAUDE_CODE_ENTRYPOINT;
  return copy;
}

export function shellCommand(
  config,
  platform = process.platform,
  env = process.env,
) {
  const shell =
    config.terminalShell ||
    (platform === "win32" ? "powershell.exe" : env.SHELL || "/bin/bash");
  if (
    config.terminalShellArgs &&
    (!Array.isArray(config.terminalShellArgs) ||
      !config.terminalShellArgs.every((x) => typeof x === "string"))
  )
    throw new Error("terminalShellArgs must be an array of arguments");
  const name = path
    .basename(shell)
    .toLowerCase()
    .replace(/\.exe$/, "");
  const args =
    config.terminalShellArgs ||
    (name === "powershell" || name === "pwsh"
      ? ["-NoLogo"]
      : ["bash", "zsh", "fish"].includes(name)
        ? ["-l"]
        : []);
  return { shell, args };
}
