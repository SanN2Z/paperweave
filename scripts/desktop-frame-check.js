import { expect } from "@playwright/test";

// Browser-only layout check. Native actions are checked separately in desktop-check.js.
export async function checkDesktopFrame(browser, origin, screenshotPath) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await page.addInitScript(() => {
    window.__PAPERWEAVE_DESKTOP__ = true;
    window.__PAPERWEAVE_CUSTOM_CHROME__ = true;
    window.__frameCalls = [];
    let maximized = false;
    window.__TAURI__ = { core: { invoke: async (command, args) => {
      if (command !== "window_action") throw new Error("Unexpected native command");
      window.__frameCalls.push(args.action);
      if (args.action === "toggle_maximize") maximized = !maximized;
      return maximized;
    } } };
  });
  try {
    await page.goto(origin);
    await expect(page.locator(".desktop-titlebar")).toBeVisible();
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".xterm-screen").first()).toBeVisible();
    const logo = page.locator(".desktop-titlebar img");
    expect(await logo.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.getByRole("button", { name: "最大化窗口", exact: true }).click();
    await expect(page.getByRole("button", { name: "还原窗口", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "还原窗口", exact: true }).click();
    await page.getByRole("button", { name: "最小化窗口", exact: true }).click();
    await page.getByRole("button", { name: "收起窗口到托盘", exact: true }).click();
    const calls = await page.evaluate(() => window.__frameCalls);
    expect(calls).toContain("ready");
    expect(calls.filter(action => action === "toggle_maximize")).toHaveLength(2);
    expect(calls).toContain("minimize");
    expect(calls).toContain("hide");
    for (const size of [{ width: 1000, height: 680 }, { width: 1600, height: 1000 }]) {
      await page.setViewportSize(size);
      const bounds = await page.locator(".app-shell").boundingBox();
      expect(bounds.y).toBe(36);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(size.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator(".desktop-window-buttons")).toBeVisible();
    }
    await page.screenshot({ path: screenshotPath });
    console.log("PASS desktop chrome browser layout, mascot assets and control wiring (native actions checked separately)");
  } finally { await page.close(); }
}
