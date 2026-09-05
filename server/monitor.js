// Adapted from ARIS-Monitor scanner.py, e59008d7a42eea50a2797e55dd0d85bbbf6572f5.
// Copyright (c) 2026 wanshuiyin. MIT; see third-party/aris-monitor-LICENSE.
// This provider only reads files. No process signals, commands or approvals.
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const priority = {
  needs_approval: 0,
  needs_attention: 1,
  idle_done: 2,
  working: 3,
  unknown: 4,
  stale: 5,
};
const string = (value) =>
  typeof value === "string" ? value.slice(0, 4000) : "";
async function readBounded(file, max, tail = false) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || (!tail && info.size > max))
    throw new Error("Invalid status file");
  const handle = await fs.open(file, "r");
  try {
    const offset = tail ? Math.max(0, info.size - max) : 0;
    const buffer = Buffer.alloc(Math.min(info.size, max));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    const text = buffer.subarray(0, bytesRead).toString("utf8");
    return offset ? text.slice(text.indexOf("\n") + 1) : text;
  } finally {
    await handle.close();
  }
}
async function transcriptInfo(home, data) {
  const id = string(data.sessionId),
    cwd = string(data.cwd);
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !cwd) return null;
  const slug = cwd.replace(/[:\\/_.]/g, "-");
  let lines;
  try {
    lines = (
      await readBounded(
        path.join(home, "projects", slug, `${id}.jsonl`),
        262144,
        true,
      )
    )
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-40);
  } catch {
    return null;
  }
  let last = null,
    background = false;
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      row?.type === "assistant" &&
      row.message &&
      typeof row.message === "object"
    ) {
      last = row.message;
      if (last.stop_reason === "end_turn") background = false;
    } else if (row?.type === "queue-operation") background = true;
  }
  if (!last) return null;
  const blocks = Array.isArray(last.content) ? last.content : [];
  return {
    stop: last.stop_reason,
    background,
    tool: string(blocks.at(-1)?.name),
  };
}
export async function scanMonitor(
  config = {},
  { currentProject = false, now = Date.now() } = {},
) {
  const home =
    config.monitorClaudeHome ||
    process.env.CLAUDE_CONFIG_DIR ||
    path.join(os.homedir(), ".claude");
  const result = {
    protocol: "paperweave-monitor/1",
    observedAt: new Date(now).toISOString(),
    project: config.projectRoot || null,
    providers: [
      {
        id: "claude",
        availability: "available",
        source: "claude-session-registry",
      },
      {
        id: "codex",
        availability: "unsupported",
        reason: "尚未接入可靠的实时会话状态源",
      },
    ],
    sessions: [],
    skipped: 0,
    truncated: false,
  };
  let names;
  try {
    names = (await fs.readdir(path.join(home, "sessions")))
      .filter((n) => /^\d+\.json$/.test(n))
      .sort();
  } catch (e) {
    result.providers[0].availability =
      e.code === "ENOENT" ? "missing" : "unavailable";
    return result;
  }
  result.truncated = names.length > 512;
  const normalize = (p) =>
    path.resolve(p).replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  for (const name of names.slice(0, 512)) {
    let data;
    try {
      data = JSON.parse(
        await readBounded(path.join(home, "sessions", name), 65536),
      );
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw new Error();
    } catch {
      result.skipped++;
      continue;
    }
    const cwd = string(data.cwd);
    if (
      currentProject &&
      (!config.projectRoot ||
        !cwd ||
        normalize(cwd) !== normalize(config.projectRoot))
    )
      continue;
    const updated = Number(data.updatedAt),
      validDate =
        Number.isFinite(updated) && updated > 0 && updated <= now + 60000;
    const age = validDate ? Math.max(0, now - updated) / 1000 : null;
    const stale = age === null || age > 1800;
    let state = "unknown",
      reason = "尚无足够状态证据",
      evidence = "registry";
    if (data.status === "waiting") {
      state = "needs_approval";
      reason = string(data.waitingFor) || "等待你处理授权";
    } else if (stale) {
      state = "stale";
      reason = "状态长时间未更新";
    } else if (
      (data.status === "busy" && age < 300) ||
      data.status === "shell"
    ) {
      state = "working";
      reason = "会话正在工作";
    } else {
      const info = await transcriptInfo(home, data);
      if (info) {
        evidence = "transcript-estimate";
        if (info.background) {
          state = "working";
          reason = "检测到后台任务记录";
        } else if (["end_turn", "stop_sequence"].includes(info.stop)) {
          state = "idle_done";
          reason = "最近一轮已结束";
        } else if (info.stop === "tool_use") {
          state = "needs_attention";
          reason = info.tool
            ? `停在 ${info.tool}，可检查进度`
            : "最近记录停在工具调用";
        }
      }
    }
    result.sessions.push({
      id: `claude:${name.slice(0, -5)}`,
      provider: "claude",
      project: cwd,
      name:
        string(data.name) ||
        cwd.split(/[\\/]/).filter(Boolean).at(-1) ||
        "Claude 会话",
      state,
      reason,
      evidence,
      stale,
      updatedAt: validDate ? new Date(updated).toISOString() : null,
    });
  }
  if (result.skipped || result.truncated)
    result.providers[0].availability = "partial";
  result.sessions.sort(
    (a, b) =>
      priority[a.state] - priority[b.state] ||
      String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
  return result;
}
