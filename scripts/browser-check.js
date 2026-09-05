import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { startServer } from "../server/index.js";
import { root } from "../server/config.js";
import { freePort, seedDemo, samplePdf } from "../test/fixtures.js";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-browser-"));
const app = await startServer({
  root,
  dataDir: dir,
  vault: path.join(dir, "vault"),
  terminalCwd: root,
  port: await freePort(),
});
const chrome =
  process.env.PAPERWEAVE_CHROME ||
  (process.platform === "win32"
    ? [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      ].find(existsSync)
    : undefined);
const browser = await chromium.launch({
  headless: true,
  ...(chrome ? { executablePath: chrome } : {}),
});
const page = await browser.newPage({
  viewport: { width: 1600, height: 1050 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
try {
  await page.goto(app.origin);
  await expect(page.getByText("把零散的论文，")).toBeVisible();
  await page.screenshot({
    path: path.join(root, "artifacts", "empty.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "添加第一篇论文", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("论文标题")
    .fill("Browser interaction fixture");
  await page
    .getByRole("dialog")
    .getByLabel("原文摘要")
    .fill("Created through the real browser form.");
  await page.getByRole("button", { name: "保存论文", exact: true }).click();
  await expect(page.locator(".paper-card")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  console.log("PASS browser paper creation and live state");
  const seeded = await seedDemo((n, a) => app.store.call(n, a));
  await expect(page.locator(".graph-node")).toHaveCount(6);
  await expect(page.locator(".detail-title")).toHaveText(
    "Efficient Adaptation with Lightweight Modules",
  );
  await page.screenshot({
    path: path.join(root, "artifacts", "workbench.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "科研图件", exact: true })
    .first()
    .click();
  await expect(page.locator(".figure-card")).toHaveCount(2);
  await page.screenshot({
    path: path.join(root, "artifacts", "figures.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "导出 PPTX" }).click();
  await expect.poll(() => !!app.store.snapshot().figures[0].pptx).toBe(true);
  console.log("PASS model and result figures; native PPTX export");
  await page
    .getByRole("button", { name: "论文写作", exact: true })
    .first()
    .click();
  await page
    .getByLabel("论文草稿")
    .selectOption({ label: "研究草稿 · 示例.md" });
  await expect(page.locator(".manuscript-editor")).toContainText("研究草稿");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".manuscript-preview")).toContainText(
    "核验参考文献",
  );
  await page.screenshot({
    path: path.join(root, "artifacts", "writing.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "源码", exact: true }).click();
  await page
    .locator(".manuscript-editor")
    .fill("# Modified through UI\n\nPreserve this thought.");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(() =>
      app.store
        .call("get_manuscript", {
          manuscriptId: app.store.snapshot().manuscripts[0].id,
        })
        .then((m) => m.body),
    )
    .toContain("Preserve this thought");
  console.log("PASS manuscript editor, Markdown preview and persistence");
  const paper = seeded.papers[1];
  const upload = await fetch(`${app.origin}/api/papers/${paper.id}/pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${app.token}`,
      "Content-Type": "application/pdf",
    },
    body: samplePdf(),
  });
  if (!upload.ok) throw new Error(await upload.text());
  await page
    .getByRole("button", { name: "论文精读", exact: true })
    .first()
    .click();
  await expect(page.locator(".textLayer span").first()).toBeVisible();
  await page.locator(".textLayer").evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  });
  await expect
    .poll(() => app.store.snapshot().context.selection)
    .toContain("source passage");
  await page
    .getByLabel("哪里还没想明白？")
    .fill("What does this source passage mean?");
  await page.getByRole("button", { name: "交给 Agent 的上下文" }).click();
  await expect
    .poll(() =>
      app.store
        .snapshot()
        .questions.some(
          (q) => q.question === "What does this source passage mean?",
        ),
    )
    .toBe(true);
  await page.screenshot({
    path: path.join(root, "artifacts", "reader.png"),
    fullPage: true,
  });
  console.log("PASS PDF rendering, text selection and contextual question");
  await page.locator(".note-item").first().click();
  await expect(page.locator(".note-editor")).toBeVisible();
  const note = await app.store.call("get_note", {
    noteId: app.store.snapshot().notes[0].id,
  });
  await fs.appendFile(note.path, "\nExternal Obsidian sync marker");
  await expect(page.locator(".note-editor")).toContainText(
    "External Obsidian sync marker",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  console.log("PASS external Obsidian note edits appear in browser");
  const info = await fetch(`${app.origin}/api/session`).then((r) => r.json());
  if (info.terminalAvailable) {
    await page.locator(".terminal-toggle").click();
    await expect(page.locator(".xterm-screen")).toBeVisible();
    await expect(page.locator(".terminal-status")).toContainText("本地 Shell");
    await page
      .locator(".xterm-helper-textarea")
      .pressSequentially("echo PAPERWEAVE_TERMINAL_OK", { delay: 25 });
    await page.locator(".xterm-helper-textarea").press("Enter");
    await expect
      .poll(
        async () =>
          (
            (await page.locator(".xterm-accessibility-tree").innerText()).match(
              /PAPERWEAVE_TERMINAL_OK/g,
            ) || []
          ).length,
        { timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(2);
    await page.screenshot({
      path: path.join(root, "artifacts", "terminal.png"),
      fullPage: true,
    });
    await page.locator(".terminal-toggle").click();
    await page.locator(".terminal-toggle").click();
    await expect(page.locator(".xterm-accessibility-tree")).toContainText(
      "PAPERWEAVE_TERMINAL_OK",
    );
    await page.locator(".xterm-helper-textarea").pressSequentially("exit");
    await page.locator(".xterm-helper-textarea").press("Enter");
    await expect(page.locator(".terminal-status")).toContainText("会话已结束");
    await page.locator(".terminal-toggle").click();
    console.log(
      "PASS real PTY command output, collapse persistence and shell exit",
    );
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "论文脉络", exact: true }).click();
  await expect(page.locator(".graph-node")).toHaveCount(6);
  await page.screenshot({
    path: path.join(root, "artifacts", "compact.png"),
    fullPage: true,
  });
  if (errors.length)
    throw new Error(`Browser runtime errors: ${errors.join("\n")}`);
  console.log("PASS desktop and compact viewport, no browser runtime errors");
} finally {
  await browser.close();
  await app.close();
  await fs.rm(dir, { recursive: true, force: true });
}
