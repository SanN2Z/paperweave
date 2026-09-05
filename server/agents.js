import { existsSync } from "node:fs";
import path from "node:path";

export function detectAgent(preference = "auto", env = process.env) {
  if (preference === "shell") return null;
  const installed = (name) =>
    (env.PATH || env.Path || "")
      .split(path.delimiter)
      .some((dir) =>
        (process.platform === "win32"
          ? [".exe", ".cmd", ".ps1", ""]
          : [""]
        ).some((ext) => existsSync(path.join(dir, name + ext))),
      );
  return (
    (preference === "auto" ? ["codex", "claude"] : [preference]).find(
      (name) => ["codex", "claude"].includes(name) && installed(name),
    ) || null
  );
}

// Fixed arguments only; no paper text, paths or browser input become shell commands.
export function agentCommand(agent) {
  if (!["codex", "claude"].includes(agent)) return null;
  return `${agent} 'Use the Paperweave MCP tools and research-workflow prompt. Read get_context silently as grounding. If there is a current reading question, answer that question in Chinese using the selected passage and read_paper as needed. Do not stop after retrieving context and do not recite workspace inventories or reading status unless I ask for status. If there is no question, greet briefly and ask what I want to work on. During discussion update the board and save useful source-linked notes. If MCP is unavailable, use the project bridge described in the agent guide.'`;
}
