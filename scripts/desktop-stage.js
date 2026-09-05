import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { root } from "../server/config.js";

if (!((process.platform === "win32" && process.arch === "x64") ||
      (process.platform === "darwin" && ["arm64", "x64"].includes(process.arch))))
  throw new Error(
    "Desktop staging supports Windows x64 and native macOS arm64/x64 builds.",
  );
const target = path.join(root, "src-tauri", "resources", "paperweave");
await fs.mkdir(target, { recursive: true });
for (const name of [
  "server",
  "shared",
  "scripts",
  "assets",
  "docs",
  "third-party",
  "dist",
  "LICENSE",
  "README.md",
  "INSTALL.md",
  "AGENTS.md",
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "package-lock.json",
])
  await fs.cp(path.join(root, name), path.join(target, name), {
    recursive: true,
  });
await fs.mkdir(path.join(target, "runtime"), { recursive: true });
const runtime = path.join(target, "runtime", process.platform === "win32" ? "node.exe" : "node");
await fs.copyFile(process.execPath, runtime);
if (process.platform !== "win32") await fs.chmod(runtime, 0o755);
const license = await fetch(
  `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
);
if (!license.ok) throw new Error("Could not include the bundled Node license");
await fs.writeFile(
  path.join(target, "runtime", "LICENSE"),
  await license.text(),
);
await new Promise((resolve, reject) => {
  // npm_execpath is set by npm run; no string-built shell command.
  if (!process.env.npm_execpath)
    return reject(new Error("Run through npm run desktop:stage"));
  const child = spawn(
    process.execPath,
    [process.env.npm_execpath, "ci", "--omit=dev", "--ignore-scripts"],
    { cwd: target, stdio: "inherit", windowsHide: true },
  );
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`Dependency staging failed (${code})`)),
  );
});
// Fix published helper permissions before bundle signing, not on first launch.
await new Promise((resolve, reject) => {
  const child = spawn(runtime, [path.join(target, "scripts/prepare-pty.js")], {
    cwd: target, stdio: "inherit", windowsHide: true,
  });
  child.on("error", reject);
  child.on("exit", code => code === 0 ? resolve() : reject(new Error(`PTY preparation failed (${code})`)));
});
await fs.writeFile(
  path.join(target, "desktop-bundle.json"),
  JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    node: process.version,
  }),
);
console.log(
  "Staged application, Node runtime, native dependencies and licenses.",
);
