import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
import { root } from "../server/config.js";

// Called only by the native host. Stdout is one token-free JSON result.
const args = process.argv.slice(2);
const option = (key) => {
  const i = args.indexOf(key);
  return i < 0 ? undefined : args[i + 1];
};
const project = option("--project");
const dataDir = path.resolve(
  project ? path.join(project, ".paperweave") : option("--data-dir"),
);
await fs.mkdir(dataDir, { recursive: true });
const env = { ...process.env, PAPERWEAVE_DATA_DIR: dataDir };
delete env.PAPERWEAVE_PORT;
delete env.PAPERWEAVE_PROJECT;
async function run(script, argv = []) {
  const log = await fs.open(path.join(dataDir, "desktop-launch.log"), "a");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.join(root, "scripts", script), ...argv],
        {
          cwd: root,
          env,
          windowsHide: true,
          stdio: ["ignore", log.fd, log.fd],
        },
      );
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `Startup failed (${code}). See ${path.join(dataDir, "desktop-launch.log")}`,
              ),
            ),
      );
    });
  } finally {
    await log.close();
  }
}
if (project) {
  await run("project.js", [
    "init",
    "--project",
    path.resolve(project),
    "--no-browser",
  ]);
} else {
  const configPath = path.join(dataDir, "config.json");
  let saved = {};
  try {
    saved = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  let running = false;
  try {
    const runtime = JSON.parse(
      await fs.readFile(path.join(dataDir, "runtime.json"), "utf8"),
    );
    if (new URL(runtime.url).hostname === "127.0.0.1") {
      const session = await fetch(`${runtime.url}/api/session`, {
        signal: AbortSignal.timeout(1000),
      }).then((r) => r.json());
      running =
        runtime.token === session.token && session.protocol === "paperweave/1";
      if (running) saved.port = Number(new URL(runtime.url).port);
    }
  } catch {}
  if (!running) {
    const listener = net.createServer();
    await new Promise((resolve, reject) => {
      listener.once("error", reject);
      listener.listen(0, "127.0.0.1", resolve);
    });
    saved.port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
  }
  saved.terminalCwd ||= os.homedir();
  saved.vault ||= path.join(dataDir, "vault");
  await fs.writeFile(configPath, JSON.stringify(saved, null, 2) + "\n");
  await run("launch.js", ["--no-browser"]);
}
const runtime = JSON.parse(
  await fs.readFile(path.join(dataDir, "runtime.json"), "utf8"),
);
console.log(
  JSON.stringify({
    origin: runtime.url,
    project: project ? path.resolve(project) : null,
    dataDir,
  }),
);
