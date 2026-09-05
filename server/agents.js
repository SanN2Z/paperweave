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
  return `${agent} 'Use the Paperweave MCP tools. First call get_context and read the research-workflow prompt. Briefly greet me in Chinese, mention any existing research context, and ask what I want to research or continue. During our conversation update the board and save source-linked notes using the workflow. If MCP is unavailable, explain how to reconnect it. Wait for my answer before starting research.'`;
}
