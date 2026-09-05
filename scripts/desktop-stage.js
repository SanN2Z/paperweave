import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { root } from "../server/config.js";

if (process.platform !== "win32" || process.arch !== "x64")
  throw new Error(
    "This release target is Windows x64; other platforms are not yet validated.",
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
  "THIRD_PARTY_NOTICES.md",
  "package.json",
  "package-lock.json",
])
  await fs.cp(path.join(root, name), path.join(target, name), {
    recursive: true,
  });
await fs.mkdir(path.join(target, "runtime"), { recursive: true });
await fs.copyFile(process.execPath, path.join(target, "runtime", "node.exe"));
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
