import fs from "node:fs/promises";
import { openSync, closeSync, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { configuration } from "../server/config.js";

const config = await configuration();
const url = `http://127.0.0.1:${config.port}`;
async function ready() {
  try {
    const response = await fetch(`${url}/api/session`, {
      signal: AbortSignal.timeout(800),
    });
    if (!response.ok) return false;
    const session = await response.json();
    const runtime = JSON.parse(
      await fs.readFile(path.join(config.dataDir, "runtime.json"), "utf8"),
    );
    return (
      session.protocol === "paperweave/1" &&
      runtime.url === url &&
      runtime.token === session.token
    );
  } catch {
    return false;
  }
}
if (!(await ready())) {
  if (!existsSync(path.join(config.root, "dist/index.html"))) {
    console.log("Preparing the workbench…");
    await new Promise((resolve, reject) => {
      const build = spawn(
        process.execPath,
        [path.join(config.root, "node_modules/vite/bin/vite.js"), "build"],
        { cwd: config.root, stdio: "inherit", windowsHide: true },
      );
      build.on("error", reject);
      build.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error("Build failed; run npm ci, then npm run build.")),
      );
    });
  }
  await fs.mkdir(config.dataDir, { recursive: true });
  const out = openSync(path.join(config.dataDir, "server.log"), "a");
  const err = openSync(path.join(config.dataDir, "server-error.log"), "a");
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: config.root,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, err],
  });
  closeSync(out);
  closeSync(err);
  let failed;
  child.on("error", (error) => {
    failed = error;
  });
  child.on("exit", (code) => {
    failed ||= new Error(`Server exited (${code}).`);
  });
  child.unref();
  let running = false;
  for (let i = 0; i < 60 && !failed; i++) {
    if (await ready()) {
      running = true;
      break;
    }
    await delay(250);
  }
  if (!running) {
    child.kill();
    throw new Error(
      `${failed?.message || "Server did not start."} See ${path.join(config.dataDir, "server-error.log")}`,
    );
  }
}
console.log(`Paperweave: ${url}`);
if (!process.argv.includes("--no-browser")) {
  const [command, args] =
    process.platform === "win32"
      ? ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  const browser = spawn(command, args, {
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  });
  browser.on("error", () =>
    console.log("Open the address above in your browser."),
  );
  browser.on("exit", (code) => {
    if (code) console.log("Open the address above in your browser.");
  });
  browser.unref();
}
