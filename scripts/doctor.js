import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { configuration } from "../server/config.js";
import "./prepare-pty.js";
const exec = promisify(execFile),
  config = await configuration();
async function locate(command) {
  try {
    const { stdout } = await exec(
      process.platform === "win32" ? "where.exe" : "which",
      [command],
      { timeout: 5000, windowsHide: true },
    );
    return { path: stdout.trim().split(/\r?\n/)[0] };
  } catch (e) {
    return {
      path: null,
      reason: ["EPERM", "EACCES"].includes(e.code)
        ? "execution-restricted"
        : "not-found",
    };
  }
}
async function checkFile(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
const versions = process.versions.node.split(".").map(Number);
const checks = [
  {
    id: "node",
    required: true,
    ok: versions[0] > 22 || (versions[0] === 22 && versions[1] >= 13),
    version: process.version,
    fix: "Install Node.js 24 LTS. See docs/DEPENDENCIES.md.",
  },
];
for (const [id, command, required] of [
  ["git", "git", false],
  ["codex", "codex", false],
  ["claude", "claude", false],
  ["latex", "pdflatex", false],
]) {
  const found = await locate(command);
  checks.push({
    id,
    required,
    ok: !!found.path,
    path: found.path,
    reason: found.reason,
    fix:
      found.reason === "execution-restricted"
        ? "Detection was blocked by the execution sandbox. Retry with authorized subprocess access; do not install a duplicate."
        : id === "latex"
          ? "Install a TeX distribution only when PDF compilation is needed; see docs/DEPENDENCIES.md."
          : id === "codex" || id === "claude"
            ? "Reuse an installed MCP-capable agent; only one client is needed."
            : "Install Git to clone or update the repository.",
  });
}
let ptyError = "";
try {
  await import("node-pty");
  checks.push({ id: "terminal", required: false, ok: true });
} catch (e) {
  ptyError = e.message;
  checks.push({
    id: "terminal",
    required: false,
    ok: false,
    error: ptyError,
    fix: "Run npm ci including optional dependencies. If native builds fail, install platform build tools and npm rebuild node-pty. See docs/DEPENDENCIES.md.",
  });
}
checks.push({
  id: "dependencies",
  required: true,
  ok: await checkFile(
    path.join(
      config.root,
      "node_modules",
      "@modelcontextprotocol",
      "sdk",
      "package.json",
    ),
  ),
  fix: "Run npm ci.",
});
checks.push({
  id: "frontend",
  required: true,
  ok: await checkFile(path.join(config.root, "dist", "index.html")),
  fix: "Run npm run build.",
});
let running = false;
try {
  const res = await fetch(`http://127.0.0.1:${config.port}/api/session`, {
    signal: AbortSignal.timeout(1500),
  });
  running = res.ok && (await res.json()).protocol === "paperweave/1";
} catch {}
checks.push({
  id: "service",
  required: false,
  ok: running,
  url: `http://127.0.0.1:${config.port}`,
  fix: "Run npm start in a persistent terminal or hidden background process.",
});
const report = {
  protocol: "paperweave-install/1",
  platform: process.platform,
  arch: process.arch,
  ready: checks.filter((c) => c.required).every((c) => c.ok),
  checks,
  paths: {
    installation: config.root,
    data: config.dataDir,
    vault: config.vault,
    terminalCwd: config.terminalCwd,
  },
  nextSteps: checks.filter((c) => !c.ok && c.required).map((c) => c.fix),
  guide: "docs/DEPENDENCIES.md",
};
if (process.argv.includes("--json"))
  console.log(JSON.stringify(report, null, 2));
else {
  console.log("Paperweave environment check\n");
  for (const c of checks)
    console.log(
      `${c.ok ? "OK  " : c.required ? "FAIL" : "INFO"} ${c.id}${c.version ? ` ${c.version}` : ""}${!c.ok ? ` — ${c.fix}` : ""}`,
    );
  console.log(
    `\nVault: ${config.vault}\n${report.ready ? "Core installation is ready." : "Resolve required checks, then run doctor again."}\nMachine-readable: npm run doctor -- --json`,
  );
}
if (!report.ready) process.exitCode = 1;
