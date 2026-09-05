import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { root } from "../server/config.js";

const args = process.argv.slice(2);
const command = args[0] || "init";
const option = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const project = path.resolve(option("--project") || process.cwd());
const dataDir = path.join(project, ".paperweave");
const configPath = path.join(dataDir, "config.json");
async function json(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
async function port(preferred = 47831) {
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(preferred, "127.0.0.1", resolve);
    });
    const value = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    return value;
  } catch (e) {
    if (preferred && e.code === "EADDRINUSE") return port(0);
    throw e;
  }
}
async function running() {
  try {
    const runtime = await json(path.join(dataDir, "runtime.json"), null);
    if (!runtime || new URL(runtime.url).hostname !== "127.0.0.1") return false;
    const result = await fetch(`${runtime.url}/api/session`, {
      signal: AbortSignal.timeout(1000),
    }).then((r) => r.json());
    return result.token === runtime.token ? runtime : false;
  } catch {
    return false;
  }
}
if (["init", "start"].includes(command)) {
  if (!(await fs.stat(project)).isDirectory())
    throw new Error("Choose an existing research directory");
  await fs.mkdir(dataDir, { recursive: true });
  const saved = await json(configPath, {}),
    runtime = await running();
  const config = {
    ...saved,
    projectRoot: project,
    vault: saved.vault || path.join(project, "paperweave", "vault"),
    terminalCwd: project,
    port: runtime
      ? Number(new URL(runtime.url).port)
      : await port(saved.port || 47831),
  };
  if (option("--shell")) config.terminalShell = option("--shell");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
  if (command === "init") {
    const workspace = path.join(project, "paperweave");
    await fs.mkdir(path.join(workspace, "figures"), { recursive: true });
    const layoutPath = path.join(workspace, "project.json");
    if (!(await json(layoutPath, null)))
      await fs.writeFile(
        layoutPath,
        JSON.stringify(
          { protocol: "paperweave-project/1", harness: "auto" },
          null,
          2,
        ) + "\n",
      );
    const ignore = path.join(project, ".gitignore");
    let contents = "";
    try {
      contents = await fs.readFile(ignore, "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (
      !contents
        .split(/\r?\n/)
        .some((line) => [".paperweave/", "/.paperweave/"].includes(line.trim()))
    )
      await fs.writeFile(
        ignore,
        contents +
          (contents.endsWith("\n") || !contents ? "" : "\n") +
          ".paperweave/\n",
      );
    const mcpPath = path.join(project, ".mcp.json"),
      mcp = await json(mcpPath, {});
    mcp.mcpServers ||= {};
    if (!mcp.mcpServers.paperweave) {
      mcp.mcpServers.paperweave = {
        command: process.execPath,
        args: [path.join(root, "server/mcp.js")],
        env: { PAPERWEAVE_PROJECT: project },
      };
      await fs.writeFile(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
    }
    const codexDir = path.join(project, ".codex");
    await fs.mkdir(codexDir, { recursive: true });
    const codexPath = path.join(codexDir, "config.toml");
    let toml = "";
    try {
      toml = await fs.readFile(codexPath, "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (!/^\s*\[mcp_servers\.paperweave\]/m.test(toml))
      await fs.writeFile(
        codexPath,
        toml +
          `\n[mcp_servers.paperweave]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(root, "server/mcp.js"))}]\n[mcp_servers.paperweave.env]\nPAPERWEAVE_PROJECT = ${JSON.stringify(project)}\n`,
      );
    await fs.writeFile(
      path.join(dataDir, "AGENT.md"),
      `# Research project\n\nProject: ${project}\n\nRead ${path.join(root, "docs/AGENT_GUIDE.md")} and ${path.join(root, "docs/WORKFLOW.md")}.\n\nUse MCP get_context silently as grounding, then answer the user's actual question. If the current CLI cannot load new MCP tools without restarting, preserve the conversation and use:\n\nnode ${JSON.stringify(path.join(root, "scripts/project.js"))} context --project ${JSON.stringify(project)}\nnode ${JSON.stringify(path.join(root, "scripts/project.js"))} call TOOL --project ${JSON.stringify(project)} --args-file ABSOLUTE_JSON_FILE\n\nDo not move experiments or replace existing CLI sessions.\n`,
    );
  }
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(root, "scripts/launch.js"),
        ...(args.includes("--no-browser") ? ["--no-browser"] : []),
      ],
      {
        cwd: project,
        env: {
          ...process.env,
          PAPERWEAVE_DATA_DIR: dataDir,
          PAPERWEAVE_CWD: project,
          PAPERWEAVE_PORT: String(config.port),
        },
        stdio: "inherit",
        windowsHide: true,
      },
    );
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Launch failed (${code})`)),
    );
  });
  console.log(
    `Project: ${project}\nExisting experiment files and CLI conversations stay in place.\nAgent guide: ${path.join(dataDir, "AGENT.md")}`,
  );
} else if (["context", "call"].includes(command)) {
  const runtime = await running();
  if (!runtime)
    throw new Error(
      "Start this project first: project.js start --project PATH",
    );
  const name = command === "context" ? "get_context" : args[1];
  if (!name || !/^[a-z_]+$/.test(name))
    throw new Error("Supply a valid tool name");
  const payload = option("--args-file")
    ? await json(path.resolve(option("--args-file")), {})
    : {};
  const response = await fetch(`${runtime.url}/api/tools/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${runtime.token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Tool failed");
  console.log(JSON.stringify(body, null, 2));
} else
  throw new Error(
    "Use init, start, context, or call TOOL; specify --project PATH when needed",
  );
