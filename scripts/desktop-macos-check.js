import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { webkit, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { root } from "../server/config.js";
import { seedDemo, samplePdf } from "../test/fixtures.js";

if (process.platform !== "darwin") throw new Error("Run on a native macOS runner");
function run(file, args, { input, ...options } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { timeout: 120000, ...options }, (error, stdout, stderr) =>
      error ? reject(error) : resolve({ stdout, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
let app;
if (process.env.PAPERWEAVE_MACOS_APP) app = path.resolve(process.env.PAPERWEAVE_MACOS_APP);
else {
  const images = path.join(root, "src-tauri/target/release/bundle/dmg");
  const names = (await fs.readdir(images)).filter(name => name.endsWith(".dmg"));
  assert.equal(names.length, 1, "Expected exactly one native disk image");
  const installation = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-install-"));
  const mount = path.join(installation, "image");
  await fs.mkdir(mount);
  console.log("CHECK mount the generated DMG (accepting the bundled project license)");
  await run("/usr/bin/hdiutil", ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, path.join(images, names[0])], { input: "Y\n" });
  try {
    console.log("CHECK copy the application out of the read-only disk image");
    app = path.join(installation, "安装测试", "Paperweave.app");
    await run("/usr/bin/ditto", [path.join(mount, "Paperweave.app"), app]);
  } finally {
    console.log("CHECK detach the disk image before launching the installed application");
    await run("/usr/bin/hdiutil", ["detach", mount]);
  }
  console.log("PASS disk image mounts and application copies to a Unicode installation path");
}
const bundle = path.join(app, "Contents/Resources/paperweave");
const node = path.join(bundle, "runtime/node");
const executable = path.join(app, "Contents/MacOS/paperweave-desktop");
const artifacts = path.join(root, "artifacts");
await fs.mkdir(artifacts, { recursive: true });
const helper = path.join(artifacts, "macos-window-check");
await run("/usr/bin/swiftc", [path.join(root, "scripts/macos-window.swift"), "-o", helper]);
const outcomes = [];
const pass = (text) => { outcomes.push(text); console.log(`PASS ${text}`); };
const cleanPath = "/usr/bin:/bin:/usr/sbin:/sbin";
const bundledInfo = JSON.parse((await run(node, ["-p", "JSON.stringify({arch:process.arch,platform:process.platform})"], {
  cwd: os.tmpdir(), env: { ...process.env, PATH: cleanPath },
})).stdout);
assert.equal(bundledInfo.arch, process.arch);
assert.equal(bundledInfo.platform, "darwin");
await run("/usr/bin/codesign", ["--verify", "--deep", "--strict", app]);
pass(`macOS ${process.arch} application signature integrity and matching bundled Node (no Node on PATH)`);

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-macos-"));
const dataDir = path.join(temporary, ".paperweave");
const claude = path.join(temporary, "claude");
await fs.mkdir(dataDir, { recursive: true });
await fs.mkdir(path.join(claude, "sessions"), { recursive: true });
await fs.writeFile(path.join(dataDir, "config.json"), JSON.stringify({
  agent: "shell", terminalCwd: temporary, terminalShell: "/bin/zsh", terminalShellArgs: ["-f"],
}));
await fs.writeFile(path.join(claude, "sessions/123.json"), JSON.stringify({
  status: "waiting", name: "Synthetic macOS session", cwd: temporary,
  waitingFor: "Fixture approval", updatedAt: Date.now(),
}));
const native = spawn(executable, ["--data-dir", dataDir], {
  cwd: temporary, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PATH: cleanPath, CLAUDE_CONFIG_DIR: claude },
});
let nativeLog = "";
for (const stream of [native.stdout, native.stderr]) stream.on("data", chunk => { nativeLog = (nativeLog + chunk).slice(-6000); });
let runtime, browser, client, nativeScreenshot = false;
try {
  await expect.poll(async () => {
    if (native.exitCode !== null) throw new Error(`Native application exited (${native.exitCode})`);
    try { runtime = JSON.parse(await fs.readFile(path.join(dataDir, "runtime.json"), "utf8")); return true; }
    catch { return false; }
  }, { timeout: 60000 }).toBe(true);
  const info = await fetch(`${runtime.url}/api/session`).then(r => r.json());
  assert.equal(info.token, runtime.token);
  assert.equal(await fs.realpath(info.mcpConfig.command), await fs.realpath(node));
  assert.equal(info.mcpConfig.env.PAPERWEAVE_DATA_DIR, dataDir);
  pass("native .app launcher starts its bundled service from an unrelated directory");
  const api = async (name, args = {}) => {
    const response = await fetch(`${runtime.url}/api/tools/${name}`, {
      method: "POST", headers: { Authorization: `Bearer ${runtime.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    assert.equal(response.ok, true, `Fixture tool ${name} failed`);
    return response.json();
  };
  const seeded = await seedDemo(api);
  const pdf = path.join(temporary, "fixture.pdf");
  await fs.writeFile(pdf, samplePdf(4));
  await api("attach_pdf", { paperId: seeded.papers[0].id, path: pdf });

  let windows;
  await expect.poll(async () => {
    windows = JSON.parse((await run(helper, [String(native.pid)])).stdout);
    return windows.some(w => w.bounds.Width >= 1000 && w.bounds.Height >= 680);
  }, { timeout: 30000 }).toBe(true);
  pass("native macOS workbench window is visible in the WindowServer");
  try {
    const main = windows.find(w => w.bounds.Width >= 1000);
    await run("/usr/sbin/screencapture", ["-x", "-l", String(main.id), path.join(artifacts, "macos-native.png")]);
    nativeScreenshot = true;
  } catch { console.log("LIMIT native screenshot unavailable under runner screen-capture permissions"); }

  client = new Client({ name: "paperweave-macos-check", version: "1" });
  await client.connect(new StdioClientTransport({
    ...info.mcpConfig, env: { ...info.mcpConfig.env, PATH: cleanPath }, cwd: temporary, stderr: "pipe",
  }));
  const context = await client.callTool({ name: "get_context", arguments: {} });
  assert.notEqual(context.isError, true);
  assert.ok(JSON.stringify(context.content).includes(seeded.workspace.id));
  const monitor = await client.callTool({ name: "get_monitor", arguments: {} });
  assert.notEqual(monitor.isError, true);
  assert.ok(JSON.stringify(monitor.content).includes("Synthetic macOS session"));
  pass("real bundled stdio MCP routes to the exact project and reads the Claude monitor fixture");

  // This is Playwright WebKit using the installed application's real service;
  // it is distinct from driving the system WKWebView inside the native window.
  browser = await webkit.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(runtime.url);
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".terminal-status")).toContainText("本地 Shell");
  const input = page.locator(".xterm-helper-textarea");
  // Keyboard automation does not synthesize a real Chinese IME composition.
  // Type ASCII and let the real shell emit UTF-8; native IME remains manual.
  const utf8 = [...Buffer.from("中文输出")].map(byte => `\\0${byte.toString(8).padStart(3, "0")}`).join("");
  await input.pressSequentially(`printf 'MACOS_PTY_%b\\n' '${utf8}'`, { delay: 30 });
  await input.press("Enter");
  await expect(page.locator(".xterm-accessibility-tree")).toContainText("MACOS_PTY_中文输出", { timeout: 15000 });
  pass("WebKit keyboard input and Chinese output through the bundled native PTY");
  await page.locator(".graph-node").first().dblclick();
  await expect(page.locator(".pdf-page")).toHaveCount(4);
  await expect(page.locator(".textLayer span").first()).toBeVisible();
  await page.getByRole("button", { name: "会话监控", exact: true }).click();
  await expect(page.locator(".monitor-session")).toContainText("等待你处理");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: path.join(artifacts, "macos-webkit-reader.png") });
  assert.deepEqual(errors, []);
  pass("WebKit four-page PDF text rendering, live monitor and dismissal without runtime errors");
  await fs.writeFile(path.join(artifacts, "macos-validation.json"), JSON.stringify({
    platform: process.platform, arch: process.arch, outcomes, nativeScreenshot,
    bundleRun: process.env.PAPERWEAVE_BUNDLE_RUN || process.env.GITHUB_RUN_ID || null,
    limits: ["Ad-hoc signature only; no Developer ID or notarization", "System WKWebView interactions and Finder/Gatekeeper installation require manual acceptance", "WebKit browser assertions are not native WKWebView UI automation"],
  }, null, 2));
} catch (error) {
  // Only this CI fixture is inspected; never upload a runtime token or vault.
  const ownWindows = JSON.parse((await run(helper, [String(native.pid)]).catch(() => ({ stdout: "[]" }))).stdout);
  console.error("Native test windows:", JSON.stringify(ownWindows));
  const capture = ["-x", ...(ownWindows[0] ? ["-l", String(ownWindows[0].id)] : []), path.join(artifacts, "macos-native-failure.png")];
  await run("/usr/sbin/screencapture", capture).catch(() => {});
  console.error("Native fixture process log:", nativeLog);
  const startup = await fs.readFile(path.join(dataDir, "desktop-launch.log"), "utf8").catch(() => "No desktop launch log created");
  console.error("Fixture startup log:", startup.replace(/token[=:]\S+/gi, "token=[redacted]").slice(-6000));
  throw error;
} finally {
  await browser?.close();
  await client?.close();
  native.kill();
  if (runtime?.pid) { try { process.kill(runtime.pid); } catch {} }
}
