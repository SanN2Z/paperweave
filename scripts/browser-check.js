import { chromium, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { stripVTControlCharacters } from "node:util";
import { startServer } from "../server/index.js";
import { root } from "../server/config.js";
import { freePort, seedDemo, samplePdf } from "../test/fixtures.js";
import { checkImageClipboard, backupClipboard, restoreClipboard } from "./clipboard-image-check.js";
import { checkDesktopFrame } from "./desktop-frame-check.js";

const dir = await fs.mkdtemp(path.join(os.tmpdir(), ".paperweave-browser-"));
const app = await startServer({
  root,
  dataDir: dir,
  vault: path.join(dir, "vault"),
  terminalCwd: root,
  terminalShellArgs:
    process.platform === "win32" ? ["-NoLogo", "-NoProfile"] : undefined,
  terminalThemeFile: path.join(dir, "missing-theme.json"),
  monitorClaudeHome: path.join(dir, "monitor-fixture"),
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
  deviceScaleFactor: 2,
});
const errors = [];
const terminalInputs = [];
const terminalOutputs = [];
page.on("websocket", (ws) => {
  ws.on("framesent", ({ payload }) => {
    const message = JSON.parse(String(payload));
    if (message.type === "input") terminalInputs.push(message.data);
  });
  ws.on("framereceived", ({ payload }) => {
    const message = JSON.parse(String(payload));
    if (message.type === "data") terminalOutputs.push(message.data);
  });
});
async function cancelShellLine() {
  const start = terminalOutputs.length;
  await page.locator(".xterm-helper-textarea").press("Control+c");
  // ConPTY may discard input while PowerShell handles an interrupt. Wait for
  // the actual prompt before pasting/typing the next fixture, not a fixed sleep.
  await expect.poll(() => stripVTControlCharacters(terminalOutputs.slice(start).join("")), {
    timeout: 10000,
  }).toMatch(process.platform === "win32" ? /PS [^\r\n]*>(?: |$)/ : /[\r\n]/);
}
// Exercise the compatibility build without newer JavaScript convenience APIs.
await page.addInitScript(() => {
  Promise.try = undefined;
  URL.parse = undefined;
});
page.on("pageerror", (e) => errors.push(e.message));
await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
try {
  await checkDesktopFrame(browser, app.origin, path.join(root, "artifacts/desktop-frame-preview.png"));
  await page.goto(app.origin);
  await expect(page.getByText("从一个问题开始，")).toBeVisible();
  await expect(page.locator(".terminal-dock")).toHaveClass(/is-open/);
  await expect(page.locator(".workspace-heading,.metrics")).toHaveCount(0);
  await expect(page.locator(".library")).toBeHidden();
  await expect(page.locator(".inspector")).toBeHidden();
  await page.getByRole("button", { name: "会话监控", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "未检测到 Claude 会话状态源",
  );
  const monitorDir = path.join(dir, "monitor-fixture", "sessions");
  await fs.mkdir(monitorDir, { recursive: true });
  await fs.writeFile(
    path.join(monitorDir, "123.json"),
    JSON.stringify({
      status: "waiting",
      name: "Synthetic monitor session",
      updatedAt: Date.now(),
      waitingFor: "Fixture permission prompt",
    }),
  );
  await expect(page.locator(".monitor-session")).toContainText("等待你处理");
  await expect(page.locator(".session-monitor")).toContainText(
    "Codex 实时状态暂未接入",
  );
  await fs.writeFile(
    path.join(monitorDir, "123.json"),
    JSON.stringify({
      status: "busy",
      name: "Synthetic monitor session",
      updatedAt: Date.now(),
    }),
  );
  await expect(page.locator(".monitor-session")).toContainText("工作中");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  console.log(
    "PASS monitor source availability, live waiting / working transition and dismissal",
  );
  const floatingPage = await browser.newPage();
  await floatingPage.setViewportSize({ width: 370, height: 440 });
  await floatingPage.goto(`${app.origin}/?monitor=1`);
  await expect(floatingPage.locator(".monitor-session")).toContainText("工作中");
  await expect(floatingPage.locator(".session-monitor")).toHaveCSS("font-family", /Segoe UI/);
  await expect(floatingPage.locator(".terminal-dock")).toHaveCount(0);
  await floatingPage.close();
  const tabLauncher = page.getByRole("button", { name: "新建研究标签页" });
  await tabLauncher.click();
  await expect(page.locator(".workspace-tab-menu")).toBeVisible();
  await page.locator(".topbar").click({ position: { x: 500, y: 40 } });
  await expect(page.locator(".workspace-tab-menu")).toHaveCount(0);
  await tabLauncher.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace-tab-menu")).toHaveCount(0);
  await expect(tabLauncher).toBeFocused();
  const terminalLauncher = page.getByRole("button", { name: "选择终端类型" });
  await terminalLauncher.click();
  await expect(terminalLauncher).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(terminalLauncher).toHaveAttribute("aria-expanded", "false");
  await expect(terminalLauncher).toBeFocused();
  const addPaper = page.getByRole("button", {
    name: "添加第一篇论文",
    exact: true,
  });
  await addPaper.click();
  await expect(page.getByRole("dialog").getByLabel("论文标题")).toBeFocused();
  const closeDialog = page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true });
  await closeDialog.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "保存论文", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeDialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(addPaper).toBeFocused();
  console.log(
    "PASS outside click, Escape, menu focus return and modal keyboard navigation",
  );
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
  const node = page.locator(".graph-node").first();
  await node.hover();
  const nodeBox = await node.boundingBox();
  await page.mouse.move(nodeBox.x + 40, nodeBox.y + 30);
  await page.mouse.down();
  await page.mouse.move(nodeBox.x + 110, nodeBox.y + 115, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() => app.store.snapshot().papers[0].position?.x || 0)
    .toBeGreaterThan(35);
  const savedPosition = await node.getAttribute("style");
  await page.reload();
  await expect(page.locator(".graph-node").first()).toHaveAttribute(
    "style",
    savedPosition,
  );
  const source = page.locator(".graph-port").first(),
    target = page.locator(".graph-node").nth(1);
  // Locator hover waits for the graph's post-reload fit/resize to settle.
  // Raw coordinates captured during that layout change can miss the port.
  await source.hover();
  const targetBox = await target.boundingBox();
  await page.mouse.down();
  await page.mouse.move(targetBox.x + 60, targetBox.y + 50, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog").locator('[name="source"]')).toHaveValue(
    seeded.papers[0].id,
  );
  await expect(page.getByRole("dialog").locator('[name="target"]')).toHaveValue(
    seeded.papers[1].id,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "关闭", exact: true })
    .click();
  console.log(
    "PASS freely dragged card persists and connector drag chooses relation endpoints",
  );
  await expect(page.locator(".detail-title")).toHaveText(
    "Efficient Adaptation with Lightweight Modules",
  );
  await expect(page.locator(".toast")).toHaveCount(0);
  await page.screenshot({
    path: path.join(root, "artifacts", "workbench.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "科研图件", exact: true })
    .first()
    .click();
  await expect(page.locator(".template-card")).toHaveCount(11);
  await page
    .locator(".template-card")
    .first()
    .getByRole("button", { name: "用这个模板绘图" })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("想怎么改这张图？")
    .fill("保留矢量组件，将输入标注改为视频");
  const figureCount = app.store.snapshot().figures.length;
  const promptStart = terminalInputs.length;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "用这个模板绘图", exact: true })
    .click();
  await expect
    .poll(() => app.store.snapshot().figures.length)
    .toBe(figureCount + 1);
  await expect
    .poll(() => terminalInputs.slice(promptStart).join(""))
    .toContain("refresh_figure");
  await cancelShellLine();
  // The fixture uses a Shell: natural language must never be auto-executed there.
  expect(
    terminalInputs.slice(promptStart).filter((x) => x === "\r"),
  ).toHaveLength(0);
  expect(terminalInputs.slice(promptStart).join("")).not.toMatch(/[\r\n]/);
  await page.screenshot({
    path: path.join(root, "artifacts", "templates.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "我的图件", exact: true }).click();
  await expect(page.locator(".figure-card")).toHaveCount(3);
  await page.screenshot({
    path: path.join(root, "artifacts", "figures.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "导出 PPTX" }).click();
  await expect.poll(() => !!app.store.snapshot().figures[0].pptx).toBe(true);
  console.log("PASS model and result figures; native PPTX export");
  await page.getByRole("button", { name: "关闭科研图件标签页" }).click();
  await expect(
    page.getByRole("tab", { name: "科研图件", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "新建研究标签页" }).click();
  await page
    .locator(".workspace-tab-menu")
    .getByRole("button", { name: "科研图件", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "科研图件", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("button", { name: "论文写作", exact: true })
    .first()
    .click();
  await page
    .getByLabel("论文草稿")
    .selectOption({ label: "研究草稿 · 示例.md" });
  await expect(page.locator(".manuscript-editor")).toContainText("研究草稿");
  const writingWidth = (await page.locator(".manuscript-editor").boundingBox())
    .width;
  await page.getByRole("button", { name: "专注写作", exact: true }).click();
  await expect(page.locator(".terminal-dock")).toBeHidden();
  expect(
    (await page.locator(".manuscript-editor").boundingBox()).width,
  ).toBeGreaterThan(writingWidth);
  await page.getByRole("button", { name: "退出专注", exact: true }).click();
  await expect(page.locator(".terminal-dock")).toBeVisible();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator(".manuscript-preview")).toContainText(
    "核验参考文献",
  );
  const visualDraft = page.locator(
    '.manuscript-preview [contenteditable="true"]',
  );
  await visualDraft.click();
  await visualDraft.press("Control+End");
  await visualDraft.press("Enter");
  await visualDraft.pressSequentially("Writing preview edit");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await app.store.call("get_manuscript", {
            manuscriptId: app.store
              .snapshot()
              .manuscripts.find((m) => m.format === "md").id,
          })
        ).body,
    )
    .toContain("Writing preview edit");
  await expect(page.locator(".toast")).toHaveCount(0);
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
    body: samplePdf(4),
  });
  if (!upload.ok) throw new Error(await upload.text());
  let missingOnce = true;
  await page.route("**/api/files/**", async (route) => {
    if (
      missingOnce &&
      new URL(route.request().url()).pathname.endsWith(".pdf")
    ) {
      missingOnce = false;
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: '{"error":"Not Found"}',
      });
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "论文精读", exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText("PDF 暂时无法读取");
  await expect(page.getByRole("alert")).not.toContainText("token=");
  await page.getByRole("button", { name: "重试读取", exact: true }).click();
  await expect(page.locator(".textLayer span").first()).toBeVisible();
  await page.unroute("**/api/files/**");
  console.log(
    "PASS PDF recovery and browser compatibility without Promise.try / URL.parse",
  );
  await expect(page.locator(".pdf-page")).toHaveCount(4);
  await page.locator(".pdf-scroll").hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => app.store.snapshot().context.page).toBe(2);
  await expect(page.locator('[data-page-number="2"] .textLayer')).toContainText(
    "Page 2",
  );
  await app.store.call("set_context", { page: 1 });
  await expect
    .poll(() => page.locator(".pdf-scroll").evaluate((el) => el.scrollTop))
    .toBeLessThan(30);
  await page
    .locator(".textLayer")
    .first()
    .evaluate((el) => {
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
  await expect(
    page.getByRole("toolbar", { name: "原文划选操作" }),
  ).toBeVisible();
  await expect(page.locator(".inspector")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("toolbar", { name: "原文划选操作" })).toHaveCount(
    0,
  );
  await page
    .locator(".textLayer")
    .first()
    .evaluate((el) =>
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })),
    );
  await page
    .getByRole("button", { name: "让 Agent 解读", exact: true })
    .click();
  await expect
    .poll(() =>
      app.store
        .snapshot()
        .questions.some((q) => q.question === "请结合论文上下文解读这段原文"),
    )
    .toBe(true);
  await expect(page.locator(".inspector")).toBeHidden();
  await cancelShellLine();
  await page.getByRole("button", { name: "展开笔记", exact: true }).click();
  await page
    .getByLabel("哪里还没想明白？")
    .fill("What does this source passage mean?");
  await page.getByRole("button", { name: "发送给 Agent" }).click();
  await cancelShellLine();
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
  const noteForRoundtrip = await app.store.call("get_note", {
    noteId: app.store.snapshot().notes[0].id,
  });
  const researchMarkdown =
    '\n\n## Roundtrip\n\n[[related-note|Related note]]\n\nInline $x_i + \\alpha$ and [@smith2025].\n\n$$\n\\frac{a}{b}\n$$\n\n- [x] Checked task\n\n| Metric | Value |\n| --- | --- |\n| Accuracy | 0.9 |\n\n```python\nprint("retained")\n```\n';
  await fs.appendFile(noteForRoundtrip.path, researchMarkdown);
  await page.locator(".note-item").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".note-preview")).toContainText("我的问题");
  const visual = page.getByRole("textbox", { name: "Markdown 可视化编辑" });
  await expect(visual).toBeVisible();
  const originalNote = await app.store.call("get_note", {
    noteId: app.store.snapshot().notes[0].id,
  });
  await visual.click();
  await visual.press("Control+End");
  await visual.press("Enter");
  await visual.pressSequentially("Edited directly in preview");
  await page
    .locator(".note-document")
    .getByRole("button", { name: /保存/ })
    .click();
  await expect
    .poll(
      async () =>
        (await app.store.call("get_note", { noteId: originalNote.id })).body,
    )
    .toContain("Edited directly in preview");
  const editedNote = await app.store.call("get_note", {
    noteId: originalNote.id,
  });
  const frontmatter = originalNote.body.match(/^---\r?\n[\s\S]*?\r?\n---/)?.[0];
  if (frontmatter) expect(editedNote.body.startsWith(frontmatter)).toBe(true);
  for (const fragment of [
    "[[related-note|Related note]]",
    "$x_i + \\alpha$",
    "\\frac{a}{b}",
    "[@smith2025]",
    "Checked task",
    "Accuracy",
    'print("retained")',
  ])
    expect(editedNote.body).toContain(fragment);
  await page.screenshot({
    path: path.join(root, "artifacts", "notes.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Markdown 源码", exact: true })
    .click();
  await expect(page.locator(".note-editor")).toBeVisible();
  // A long document should keep the reading position when changing edit modes.
  const sourceEditor = page.locator(".note-editor");
  const sourceBody = await sourceEditor.inputValue();
  await sourceEditor.fill(
    sourceBody +
      "\n\n" +
      Array.from(
        { length: 45 },
        (_, i) => `Scroll fixture paragraph ${i + 1}.\n\n`,
      ).join(""),
  );
  await sourceEditor.evaluate((node) => {
    node.scrollTop = 480;
    node.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  const sourceScroll = await sourceEditor.evaluate((node) => node.scrollTop);
  expect(sourceScroll).toBeGreaterThan(100);
  await page.getByRole("button", { name: "可视化编辑", exact: true }).click();
  await expect(
    page.locator(".note-reading-pane [contenteditable=true]"),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".note-reading-pane").evaluate((node) => node.scrollTop),
    )
    .toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Markdown 源码", exact: true })
    .click();
  await expect
    .poll(() => sourceEditor.evaluate((node) => node.scrollTop))
    .toBe(sourceScroll);
  await sourceEditor.fill(sourceBody);
  await page
    .locator(".note-document")
    .getByRole("button", { name: /保存/ })
    .click();
  await expect
    .poll(
      async () =>
        (await app.store.call("get_note", { noteId: originalNote.id })).body,
    )
    .toBe(sourceBody);
  console.log(
    "PASS document scroll survives source / visual editing roundtrip",
  );
  const note = await app.store.call("get_note", {
    noteId: app.store.snapshot().notes[0].id,
  });
  await fs.appendFile(note.path, "\nExternal Obsidian sync marker");
  await expect(page.locator(".note-editor")).toContainText(
    "External Obsidian sync marker",
  );
  await page.getByRole("button", { name: "返回笔记列表", exact: true }).click();
  console.log("PASS external Obsidian note edits appear in browser");
  await expect(page.locator(".inspector")).toBeHidden();
  await page.getByRole("button", { name: "研究笔记", exact: true }).click();
  await expect(page.locator(".research-note-card")).toHaveCount(1);
  await page.getByRole("button", { name: "论文脉络", exact: true }).click();
  const info = await fetch(`${app.origin}/api/session`).then((r) => r.json());
  if (info.terminalAvailable) {
    await expect(page.locator(".xterm-screen")).toBeVisible();
    await expect(page.locator(".terminal-status")).toContainText("本地 Shell");
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"]);
    await backupClipboard(page);
    try {
      const shortcuts =
        process.platform === "darwin"
          ? ["Meta+v", "Control+Shift+v", "button"]
          : ["Control+v", "Control+Shift+v", "Shift+Insert", "button"];
      for (const shortcut of shortcuts) {
        const marker = `# PDF 加载失败，中文粘贴 ${shortcut}\n# 第二行`;
        await page.evaluate(
          (text) => navigator.clipboard.writeText(text),
          marker,
        );
        const start = terminalInputs.length;
        if (shortcut === "button")
          await page.getByRole("button", { name: "粘贴", exact: true }).click();
        else await page.locator(".xterm-helper-textarea").press(shortcut);
        await expect
          .poll(() => terminalInputs.slice(start).join(""))
          .toContain(marker.replace(/\n/g, "\r"));
        // Allow an accidental second delivery to arrive before checking uniqueness.
        await page.waitForTimeout(150);
        const received = terminalInputs.slice(start).join("");
        expect(received.split("PDF 加载失败").length - 1).toBe(1);
        expect(received).not.toContain("\x16");
        await cancelShellLine();
      }
      await page.context().clearPermissions();
      await page.evaluate(() => {
        Object.defineProperty(navigator.clipboard, "readText", {
          configurable: true,
          value: () =>
            Promise.reject(new DOMException("Denied", "NotAllowedError")),
        });
      });
      await page.getByRole("button", { name: "粘贴", exact: true }).click();
      await expect(page.locator(".terminal-clipboard-error")).toContainText(
        "Ctrl+V",
      );
      const nativeStart = terminalInputs.length;
      await page
        .locator(".xterm-helper-textarea")
        .press(process.platform === "darwin" ? "Meta+v" : "Control+v");
      await expect
        .poll(() => terminalInputs.slice(nativeStart).join(""))
        .toContain("PDF 加载失败");
      await expect(page.locator(".terminal-clipboard-error")).toHaveCount(0);
      await cancelShellLine();
      await page.evaluate(() => delete navigator.clipboard.readText);
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      await checkImageClipboard(page, terminalInputs, cancelShellLine, dir);
    } finally {
      await page
        .context()
        .grantPermissions(["clipboard-read", "clipboard-write"]);
      await restoreClipboard(page);
    }
    console.log(
      "PASS real clipboard: Chinese multiline, Ctrl+V, Ctrl+Shift+V, Shift+Insert, button, and denied permission feedback",
    );
    await page
      .locator(".xterm-helper-textarea")
      .pressSequentially("echo PAPERWEAVE_TERMINAL_OK", { delay: 25 });
    await page.locator(".xterm-helper-textarea").press("Enter");
    await expect
      .poll(
        async () =>
          (
            (await page.locator(".xterm-accessibility-tree").innerText())
              .replace(/\s+/g, "")
              .match(/PAPERWEAVE_TERMINAL_OK/g) || []
          ).length,
        { timeout: 10000 },
      )
      .toBeGreaterThanOrEqual(2);
    await expect(page.locator(".terminal-content")).toHaveCSS(
      "background-color",
      "rgb(231, 219, 180)",
    );
    await page.getByLabel("终端配色", { exact: true }).selectOption("dark");
    await expect(page.locator(".terminal-content")).toHaveCSS(
      "background-color",
      "rgb(24, 24, 24)",
    );
    await expect(page.locator(".xterm-accessibility-tree")).toContainText(
      "PAPERWEAVE_TERMINAL_OK",
    );
    await page.getByLabel("终端配色", { exact: true }).selectOption("local");
    const size = await page.locator(".terminal-dock").boundingBox();
    const canvasBeforeResize = await page.locator(".canvas-area").boundingBox();
    await page.getByRole("separator", { name: "调整终端宽度" }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect
      .poll(
        async () => (await page.locator(".terminal-dock").boundingBox()).width,
      )
      .toBeGreaterThan(size.width);
    await expect
      .poll(
        async () => (await page.locator(".canvas-area").boundingBox()).height,
      )
      .toBe(canvasBeforeResize.height);
    await page.locator(".xterm-helper-textarea").focus();
    await expect(page.locator(".xterm-cursor").first()).toHaveCSS(
      "animation-name",
      "none",
    );
    await expect(page.locator(".xterm-cursor").first()).toHaveCSS(
      "background-color",
      "rgba(0, 0, 0, 0)",
    );
    const beforeKeys = terminalInputs.length;
    await page.locator(".xterm-helper-textarea").press("Control+Shift+d");
    await expect(page.locator(".terminal-session:not([hidden])")).toHaveCount(
      2,
    );
    await page
      .locator('.terminal-session[data-session-id="2"] .xterm-helper-textarea')
      .press("Alt+ArrowUp");
    await expect(
      page.locator(
        '.terminal-session[data-session-id="1"] .xterm-helper-textarea',
      ),
    ).toBeFocused();
    await page.keyboard.press("Alt+ArrowDown");
    await expect(
      page.locator(
        '.terminal-session[data-session-id="2"] .xterm-helper-textarea',
      ),
    ).toBeFocused();
    await page.keyboard.press("Control+Shift+w");
    await expect(page.locator(".terminal-session")).toHaveCount(1);
    expect(terminalInputs.slice(beforeKeys).join("")).not.toContain("\x04");
    console.log(
      "PASS terminal split/focus/close shortcuts and thin steady cursor",
    );
    await page.getByRole("button", { name: "终端分屏", exact: true }).click();
    await expect(page.locator(".terminal-session:not([hidden])")).toHaveCount(
      2,
    );
    await expect(page.locator(".terminal-status").last()).toContainText(
      "本地 Shell",
    );
    await page
      .getByRole("button", { name: "结束 Terminal 3", exact: true })
      .click();
    await expect(page.locator(".terminal-session")).toHaveCount(1);
    await expect(page.locator(".xterm-accessibility-tree")).toContainText(
      "PAPERWEAVE_TERMINAL_OK",
    );
    await page.getByRole("button", { name: "最大化终端", exact: true }).click();
    await expect(page.locator(".canvas-area")).toBeHidden();
    await page.getByRole("button", { name: "还原终端", exact: true }).click();
    await expect(page.locator(".canvas-area")).toBeVisible();
    await page.screenshot({
      path: path.join(root, "artifacts", "terminal.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "终端", exact: true }).click();
    await page.getByRole("button", { name: "终端", exact: true }).click();
    await expect(page.locator(".xterm-accessibility-tree")).toContainText(
      "PAPERWEAVE_TERMINAL_OK",
    );
    await page.locator(".xterm-helper-textarea").pressSequentially("exit");
    await page.locator(".xterm-helper-textarea").press("Enter");
    await expect(page.locator(".terminal-status")).toContainText("会话已结束");
    await page.getByRole("button", { name: "重新连接", exact: true }).click();
    await expect(page.locator(".terminal-status")).toContainText("本地 Shell");
    console.log(
      "PASS real PTY output, theme switching without session loss, resize, split, maximize, collapse and shell exit",
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
} catch (error) {
  // This harness uses only synthetic fixtures. Keep failure evidence in CI.
  await page.screenshot({ path: path.join(root, "artifacts/browser-failure.png"), fullPage: true }).catch(() => {});
  console.error("Synthetic terminal at failure:", await page.locator(".xterm-accessibility-tree").allTextContents().catch(() => []));
  throw error;
} finally {
  await browser.close();
  await app.close();
  await fs.rm(dir, { recursive: true, force: true });
}
