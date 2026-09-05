import fs from "node:fs/promises";
import path from "node:path";
import { configuration } from "../server/config.js";
const config = await configuration();
const args = process.argv.slice(2),
  value = (key) =>
    args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const vault = value("--vault"),
  cwd = value("--cwd"),
  port = value("--port"),
  agent = value("--agent");
if (agent && !["auto", "codex", "claude", "shell"].includes(agent))
  throw new Error("Agent must be auto, codex, claude or shell");
if (vault || cwd || port || agent) {
  if (vault) config.vault = path.resolve(vault);
  if (cwd) config.terminalCwd = path.resolve(cwd);
  if (port) {
    config.port = Number(port);
    if (
      !Number.isInteger(config.port) ||
      config.port < 1024 ||
      config.port > 65535
    )
      throw new Error("Port must be 1024–65535");
  }
  await fs.mkdir(config.dataDir, { recursive: true });
  let saved = {};
  try {
    saved = JSON.parse(
      await fs.readFile(path.join(config.dataDir, "config.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.writeFile(
    path.join(config.dataDir, "config.json"),
    JSON.stringify(
      {
        ...saved,
        agent: agent || config.agent,
        vault: config.vault,
        terminalCwd: config.terminalCwd,
        port: config.port,
      },
      null,
      2,
    ),
  );
}
const entry = path.join(config.root, "server", "mcp.js");
console.log(
  `\nPaperweave · local research workbench\n\n1. npm run build\n2. npm start\n3. Open http://127.0.0.1:${config.port}\n\nVault: ${config.vault}\nTerminal directory: ${config.terminalCwd}\n\nRegister with your CLI (then restart that CLI session):\n\n  codex mcp add paperweave -- node "${entry}"\n  claude mcp add --transport stdio --scope user paperweave -- node "${entry}"\n\nGeneric MCP configuration:\n${JSON.stringify({ mcpServers: { paperweave: { command: "node", args: [entry], env: process.env.PAPERWEAVE_DATA_DIR ? { PAPERWEAVE_DATA_DIR: config.dataDir } : {} } } }, null, 2)}\n\nRead docs/WORKFLOW.md for the repeatable research contract.\n`,
);
