import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanMonitor } from "../server/monitor.js";

test("monitor distinguishes missing, partial and unknown evidence; waiting remains visible when stale", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-monitor-"));
  try {
    const config = { monitorClaudeHome: home, projectRoot: home };
    assert.equal((await scanMonitor(config)).providers[0].availability, "missing");
    await fs.mkdir(path.join(home, "sessions"));
    const now = Date.now();
    const rows = [
      { status: "waiting", updatedAt: now - 7200000, cwd: home, waitingFor: "Fixture approval" },
      { status: "busy", updatedAt: now, cwd: home },
      { status: "idle", updatedAt: now, cwd: home },
      { status: "busy", updatedAt: now - 7200000, cwd: home },
      { status: "waiting", updatedAt: now, cwd: path.join(home, "another") },
    ];
    for (const [i, row] of rows.entries()) await fs.writeFile(path.join(home, "sessions", `${i + 1}.json`), JSON.stringify(row));
    await fs.writeFile(path.join(home, "sessions/9.json"), '{"status":');
    const before = await fs.readFile(path.join(home, "sessions/1.json"), "utf8");
    const data = await scanMonitor(config, { now });
    assert.equal(data.providers[0].availability, "partial");
    assert.equal(data.providers[1].availability, "unsupported");
    assert.equal(data.skipped, 1);
    assert.equal(data.sessions.find(s => s.id === "claude:1").state, "needs_approval");
    assert.equal(data.sessions.find(s => s.id === "claude:1").stale, true);
    assert.equal(data.sessions.find(s => s.id === "claude:3").state, "unknown");
    assert.equal(data.sessions.find(s => s.id === "claude:4").state, "stale");
    assert.equal((await scanMonitor(config, { now, currentProject: true })).sessions.length, 4);
    assert.equal(await fs.readFile(path.join(home, "sessions/1.json"), "utf8"), before);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});

test("monitor uses transcript evidence for activity without inferring approvals or exposing content", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-monitor-"));
  try {
    const cwd = "C:\\research\\fixture", slug = cwd.replace(/[:\\/_.]/g, "-");
    await fs.mkdir(path.join(home, "sessions"));
    await fs.mkdir(path.join(home, "projects", slug), { recursive: true });
    const now = Date.now();
    for (const [i, stop] of ["end_turn", "tool_use"].entries()) {
      await fs.writeFile(path.join(home, "sessions", `${i + 1}.json`), JSON.stringify({ cwd, status: "idle", updatedAt: now, sessionId: `fixture${i}` }));
      await fs.writeFile(path.join(home, "projects", slug, `fixture${i}.jsonl`), JSON.stringify({ type: "assistant", message: { stop_reason: stop, content: [{ type: "tool_use", name: "Read", input: "DO NOT EXPOSE TRANSCRIPT" }] } }) + '\n{"partial":');
    }
    const data = await scanMonitor({ monitorClaudeHome: home }, { now });
    assert.equal(data.sessions.find(s => s.id === "claude:1").state, "idle_done");
    assert.equal(data.sessions.find(s => s.id === "claude:2").state, "needs_attention");
    assert.equal(data.sessions.some(s => s.state === "needs_approval"), false);
    assert.equal(JSON.stringify(data).includes("DO NOT EXPOSE TRANSCRIPT"), false);
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
