import { expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

// Uses the host clipboard, actual paste shortcuts, HTTP and PTY transmission.
// Caller owns clipboard backup/restore and cancels the current shell line.
export async function checkImageClipboard(page, inputs, cancelLine, dataDir) {
  const shortcuts =
    process.platform === "darwin"
      ? ["Meta+v", "Control+Shift+v", "button"]
      : ["Control+v", "Control+Shift+v", "Shift+Insert", "button"];
  for (const shortcut of shortcuts) {
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 48;
      canvas.height = 32;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#f5deb3";
      ctx.fillRect(0, 0, 48, 32);
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob,
          "text/plain": new Blob(["IMAGE_TEXT_MUST_NOT_BE_PASTED"], {
            type: "text/plain",
          }),
        }),
      ]);
    });
    const first = inputs.length;
    const responsePromise = page.waitForResponse((r) =>
      r.url().endsWith("/api/terminal/attachments"),
    );
    if (shortcut === "button")
      await page.getByRole("button", { name: "粘贴", exact: true }).click();
    else await page.locator(".xterm-helper-textarea").press(shortcut);
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const saved = await response.json();
    expect(path.dirname(saved.path)).toBe(path.join(dataDir, "attachments"));
    const bytes = await fs.readFile(saved.path);
    expect(bytes.readUInt32BE(16)).toBe(48);
    expect(bytes.readUInt32BE(20)).toBe(32);
    await expect
      .poll(() => inputs.slice(first).join(""))
      .toContain(saved.pasteText);
    await page.waitForTimeout(150);
    const received = inputs.slice(first).join("");
    expect(received.split(saved.pasteText).length - 1).toBe(1);
    expect(received).not.toMatch(/[\r\n\x16]/);
    expect(received).not.toContain("IMAGE_TEXT_MUST_NOT_BE_PASTED");
    await cancelLine();
  }

  const first = inputs.length;
  await page.route("**/api/terminal/attachments", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic upload failure" }),
    }),
  );
  await page
    .locator(".xterm-helper-textarea")
    .press(process.platform === "darwin" ? "Meta+v" : "Control+v");
  await expect(page.locator(".terminal-clipboard-error")).toContainText(
    "Synthetic upload failure",
  );
  expect(inputs.slice(first).join("")).toBe("");
  await page.unroute("**/api/terminal/attachments");
  const responsePromise = page.waitForResponse((r) =>
    r.url().endsWith("/api/terminal/attachments"),
  );
  await page.getByRole("button", { name: "粘贴", exact: true }).click();
  const saved = await (await responsePromise).json();
  await expect
    .poll(() => inputs.slice(first).join(""))
    .toContain(saved.pasteText);
  await expect(page.locator(".terminal-clipboard-error")).toHaveCount(0);
  await cancelLine();
  console.log(
    "PASS image clipboard: native shortcuts, button, mixed image/text, private PNG files, single PTY delivery without Enter, failure and retry",
  );
}

export async function backupClipboard(page) {
  await page.evaluate(async () => {
    window.__clipboardTestBackup = await navigator.clipboard.read();
  });
}

export async function restoreClipboard(page) {
  await page.evaluate(async () => {
    const items = window.__clipboardTestBackup;
    delete window.__clipboardTestBackup;
    if (items?.length) await navigator.clipboard.write(items);
    else await navigator.clipboard.writeText("");
  });
}
