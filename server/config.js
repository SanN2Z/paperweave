import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const dataDir = path.resolve(
  process.env.PAPERWEAVE_DATA_DIR || path.join(root, ".paperweave"),
);
export async function configuration() {
  let saved = {};
  try {
    saved = JSON.parse(
      await fs.readFile(path.join(dataDir, "config.json"), "utf8"),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const port = Number(process.env.PAPERWEAVE_PORT || saved.port || 47831);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid port");
  return {
    port,
    dataDir,
    root,
    agent: process.env.PAPERWEAVE_AGENT || saved.agent || "auto",
    terminalThemeFile:
      process.env.PAPERWEAVE_TERMINAL_THEME_FILE || saved.terminalThemeFile,
    terminalProfile:
      process.env.PAPERWEAVE_TERMINAL_PROFILE ||
      saved.terminalProfile ||
      process.env.WT_PROFILE_ID,
    terminalAppearance: saved.terminalAppearance || "light",
    vault: path.resolve(
      process.env.PAPERWEAVE_VAULT ||
        saved.vault ||
        path.join(dataDir, "vault"),
    ),
    terminalCwd: path.resolve(
      process.env.PAPERWEAVE_CWD || saved.terminalCwd || root,
    ),
  };
}
