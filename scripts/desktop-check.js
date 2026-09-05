import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { freePort, samplePdf, seedDemo } from "../test/fixtures.js";
import { root } from "../server/config.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { stripVTControlCharacters } from "node:util";
import { checkImageClipboard, backupClipboard, restoreClipboard } from "./clipboard-image-check.js";

const exe = process.env.PAPERWEAVE_DESKTOP_EXE;
if (!exe)
  throw new Error(
    "Set PAPERWEAVE_DESKTOP_EXE to the installed Windows application",
  );
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-native-"));
const debugPort = await freePort();
const dataDir = path.join(dir, ".paperweave");
const preferenceFile = path.join(
  process.env.APPDATA,
  "org.paperweave.desktop",
  "last-project.json",
);
let previousPreference;
try {
  previousPreference = await fs.readFile(preferenceFile);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(
  path.join(dataDir, "config.json"),
  JSON.stringify({
    agent: "shell",
    terminalCwd: dir,
    terminalShellArgs: ["-NoLogo", "-NoProfile"],
  }),
);
await fs.mkdir(path.join(dir, "claude/sessions"), { recursive: true });
await fs.writeFile(
  path.join(dir, "claude/sessions/123.json"),
  JSON.stringify({
    status: "waiting",
    name: "Synthetic native session",
    cwd: dir,
    waitingFor: "Fixture approval",
    updatedAt: Date.now(),
  }),
);
// Separate profile keeps native WebView storage and MCP state out of the user's work.
const child = spawn(exe, ["--data-dir", dataDir], {
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    CLAUDE_CONFIG_DIR: path.join(dir, "claude"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
    WEBVIEW2_USER_DATA_FOLDER: path.join(dir, "webview"),
    PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0`,
  },
});
let nativeOutput = "";
child.stdout.on("data", (chunk) => { nativeOutput += chunk; });
child.stderr.on("data", (chunk) => { nativeOutput += chunk; });
let browser, runtime;
let debugError;
try {
  for (let i = 0; i < 200; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, {
        timeout: 1500,
      });
      break;
    } catch (error) {
      debugError = error.message;
      if (child.exitCode !== null)
        throw new Error("Native host exited before opening its WebView");
      await delay(300);
    }
  }
  if (!browser) throw new Error(`No native WebView debugging endpoint: ${debugError}`);
  const context = browser.contexts()[0];
  let page;
  await expect
    .poll(
      () => {
        page = context
          .pages()
          .find((p) => p.url().startsWith("http://127.0.0.1:"));
        return !!page;
      },
      { timeout: 25000 },
    )
    .toBe(true);
  await expect(page.locator(".topbar")).toBeVisible();
  if (await page.evaluate(() => !!window.__PAPERWEAVE_CUSTOM_CHROME__)) {
    await expect(page.locator(".desktop-titlebar")).toBeVisible();
    await page.getByRole("button", { name: "最大化窗口", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__TAURI__.core.invoke("window_action", { action: "state" }))).toBe(true);
    await page.getByRole("button", { name: "还原窗口", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__TAURI__.core.invoke("window_action", { action: "state" }))).toBe(false);
    await page.getByRole("button", { name: "最小化窗口", exact: true }).click();
    await page.evaluate(() => window.__TAURI__.core.invoke("show_workbench"));
    console.log("PASS native custom title bar maximize, restore and minimize/restore");
  }
  runtime = JSON.parse(
    await fs.readFile(path.join(dataDir, "runtime.json"), "utf8"),
  );
  const api = async (name, args) => {
    const response = await fetch(`${runtime.url}/api/tools/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtime.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error(`Fixture tool failed: ${name}`);
    return response.json();
  };
  const seeded = await seedDemo(api);
  await expect(page.locator(".graph-node")).toHaveCount(6);
  await expect(page.locator(".xterm-screen")).toBeVisible();
  const term = page.locator(".xterm-helper-textarea");
  const inputs = [],
    output = [];
  const websocket = await page.context().newCDPSession(page);
  await websocket.send("Network.enable");
  websocket.on("Network.webSocketFrameSent", (e) => {
    try {
      const m = JSON.parse(e.response.payloadData);
      if (m.type === "input") inputs.push(m.data);
    } catch {}
  });
  websocket.on("Network.webSocketFrameReceived", (e) => {
    try {
      const m = JSON.parse(e.response.payloadData);
      if (m.type === "data") output.push(m.data);
    } catch {}
  });
  await term.press("Control+c");
  await term.pressSequentially("Write-Output 'NATIVE_TERMINAL_OK'");
  await term.press("Enter");
  await expect.poll(() => inputs.join("")).toContain("NATIVE_TERMINAL_OK");
  await expect
    .poll(() => output.join("").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ""))
    .toMatch(/NATIVE_TERMINAL_OK\r?\n/);
  console.log(
    "PASS native WebView, embedded real PTY keyboard input and synthetic project",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: runtime.url,
  });
  await backupClipboard(page);
  const cancelLine = async () => {
    const first = output.length;
    await term.press("Control+c");
    await expect.poll(() => stripVTControlCharacters(output.slice(first).join("")), { timeout: 10000 }).toMatch(/PS [^\r\n]*>(?: |$)/);
  };
  try {
    await page.evaluate(() =>
      navigator.clipboard.writeText("NATIVE_CLIPBOARD_科研粘贴"),
    );
    const first = inputs.length;
    await term.press("Control+v");
    await expect
      .poll(() => inputs.slice(first).join(""))
      .toContain("NATIVE_CLIPBOARD_科研粘贴");
    await cancelLine();
    console.log("PASS native WebView real clipboard paste into the PTY");
    await checkImageClipboard(page, inputs, cancelLine, dataDir);
  } finally {
    await restoreClipboard(page);
  }
  const pdf = path.join(dir, "fixture.pdf");
  await fs.writeFile(pdf, samplePdf(4));
  await api("attach_pdf", { paperId: seeded.papers[0].id, path: pdf });
  await page.locator(".graph-node").first().dblclick();
  await expect(page.locator(".pdf-page")).toHaveCount(4);
  await expect(page.locator(".textLayer span").first()).toBeVisible();
  console.log(
    "PASS PDF rendering and selectable text inside the native WebView",
  );
  await page.evaluate(() => window.__TAURI__.core.invoke("open_monitor"));
  let monitor;
  await expect
    .poll(() => {
      monitor = context.pages().find((p) => p.url().includes("monitor=1"));
      return !!monitor;
    })
    .toBe(true);
  await expect(monitor.locator(".monitor-session")).toContainText("等待你处理");
  await monitor.getByRole("button", { name: "取消置顶" }).click();
  await expect(monitor.getByRole("button", { name: "置顶浮窗" })).toBeVisible();
  await monitor.getByRole("button", { name: "折叠监控" }).click();
  await expect(monitor.locator(".session-monitor")).toHaveClass(/collapsed/);
  await monitor.getByRole("button", { name: "展开监控" }).click();
  const documentIdentity = await page.evaluate(() => {
    window.__nativeContinuity = crypto.randomUUID();
    return window.__nativeContinuity;
  });
  if (await page.evaluate(() => !!window.__PAPERWEAVE_CUSTOM_CHROME__))
    await page.getByRole("button", { name: "收起窗口到托盘" }).click();
  else await page.evaluate(() => window.__TAURI__.core.invoke("hide_window"));
  await monitor.getByRole("button", { name: "工作台", exact: true }).click();
  expect(await page.evaluate(() => window.__nativeContinuity)).toBe(
    documentIdentity,
  );
  await expect(page.locator(".terminal-status")).toContainText("本地 Shell");
  console.log(
    "PASS separate native monitor, pinning, collapse and hide/restore without remounting the terminal",
  );
  await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "artifacts/desktop-reader.png"),
  });
  await monitor.screenshot({
    path: path.join(root, "artifacts/desktop-monitor.png"),
  });
  const info = await fetch(`${runtime.url}/api/session`).then((r) => r.json());
  expect(info.mcpConfig.command.toLowerCase()).toContain("runtime");
  expect(info.mcpConfig.env.PAPERWEAVE_DATA_DIR).toBe(dataDir);
  const mcp = new Client({ name: "paperweave-native-check", version: "1" });
  try {
    await mcp.connect(
      new StdioClientTransport({
        ...info.mcpConfig,
        cwd: os.tmpdir(),
        stderr: "pipe",
      }),
    );
    const result = await mcp.callTool({ name: "get_context", arguments: {} });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result.content)).toContain(seeded.workspace.id);
  } finally {
    await mcp.close();
  }
  console.log(
    "PASS installed application uses bundled Node and exact MCP space routing",
  );
} catch (error) {
  console.log("Native host status:", { pid: child.pid, exitCode: child.exitCode });
  console.log("Native startup:", nativeOutput.replace(/[a-f0-9]{64}/gi, "[redacted]"));
  console.log("Fixture files:", await fs.readdir(dataDir));
  for (const context of browser?.contexts() || [])
    for (const page of context.pages()) {
      console.log(
        "Native page:",
        new URL(page.url()).origin,
        await page
          .locator("#error")
          .textContent({ timeout: 500 })
          .catch(() => ""),
      );
      await page
        .screenshot({
          path: path.join(root, "artifacts/desktop-diagnostic.png"),
        })
        .catch(() => {});
    }
  throw error;
} finally {
  await browser?.close();
  child.kill();
  if (!runtime) {
    try {
      runtime = JSON.parse(
        await fs.readFile(path.join(dataDir, "runtime.json"), "utf8"),
      );
    } catch {}
  }
  if (runtime?.pid) {
    try {
      process.kill(runtime.pid);
    } catch {}
  }
  await delay(1000);
  // Also supports early candidates that remembered an explicit test data directory.
  try {
    if (
      JSON.parse(await fs.readFile(preferenceFile, "utf8")).dataDir === dataDir
    ) {
      if (previousPreference)
        await fs.writeFile(preferenceFile, previousPreference);
      else await fs.unlink(preferenceFile);
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await fs.rm(dir, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 300,
  });
}
