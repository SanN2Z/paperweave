import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startServer } from "../server/index.js";
import { root } from "../server/config.js";
import { freePort, samplePdf } from "./fixtures.js";
let dir, app, client;
const api = async (url, body) => {
  const res = await fetch(`${app.origin}${url}`, {
    ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    headers: {
      Authorization: `Bearer ${app.token}`,
      "Content-Type": "application/json",
    },
  });
  return { res, data: await res.json() };
};
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-integration-"));
  app = await startServer({
    root,
    dataDir: dir,
    vault: path.join(dir, "vault"),
    terminalCwd: root,
    port: await freePort(),
  });
});
after(async () => {
  await client?.close();
  await app?.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("daily launcher reuses the matching running workspace without exposing its token", async () => {
  const before = await fs.readFile(path.join(dir, "runtime.json"), "utf8");
  const { stdout } = await promisify(execFile)(
    process.execPath,
    ["scripts/launch.js", "--no-browser"],
    {
      cwd: root,
      windowsHide: true,
      timeout: 10000,
      env: {
        ...process.env,
        PAPERWEAVE_DATA_DIR: dir,
        PAPERWEAVE_PORT: String(app.server.address().port),
        PAPERWEAVE_AGENT: "shell",
      },
    },
  );
  assert.match(stdout, /Paperweave: http:\/\/127\.0\.0\.1:/);
  assert.ok(!stdout.includes(app.token));
  assert.equal(
    await fs.readFile(path.join(dir, "runtime.json"), "utf8"),
    before,
  );
});
test("local HTTP requires authentication and rejects foreign origins / DNS rebinding", async () => {
  assert.equal((await fetch(`${app.origin}/api/state`)).status, 401);
  assert.equal(
    (
      await fetch(`${app.origin}/api/session`, {
        headers: { Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const badHost = await new Promise((resolve, reject) => {
    http
      .get(
        `${app.origin}/api/session`,
        { headers: { Host: "evil.example" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      )
      .on("error", reject);
  });
  assert.equal(badHost, 403);
  const { data } = await api("/api/state");
  assert.equal(data.papers.length, 0);
});
test("a real stdio MCP client discovers tools, reads the workflow and updates the live UI stream", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(root, "server", "mcp.js")],
    env: { ...process.env, PAPERWEAVE_DATA_DIR: dir },
    stderr: "pipe",
  });
  client = new Client({ name: "paperweave-test", version: "1.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === "plot_results"));
  assert.ok(tools.some((t) => t.name === "save_manuscript"));
  const prompt = await client.getPrompt({ name: "research-workflow" });
  assert.match(prompt.messages[0].content.text, /paperweave\/1/);
  const ws = new WebSocket(
    `${app.origin.replace("http", "ws")}/events?token=${app.token}`,
    { origin: app.origin },
  );
  await once(ws, "open");
  const update = new Promise((resolve) =>
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.state?.papers.some((p) => p.title === "MCP paper")) resolve(m);
    }),
  );
  const result = await client.callTool({
    name: "upsert_paper",
    arguments: { title: "MCP paper", summary: "Real protocol test" },
  });
  assert.ok(!result.isError);
  const event = await Promise.race([
    update,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Missing live update")), 5000).unref(),
    ),
  ]);
  assert.equal(event.state.papers[0].summary, "Real protocol test");
  const resource = await client.readResource({ uri: "paperweave://context" });
  assert.match(resource.contents[0].text, /MCP paper/);
  ws.close();
});
test("uploaded PDF text is readable through MCP with page provenance", async () => {
  const { data: p } = await api("/api/tools/upsert_paper", {
    title: "PDF fixture",
  });
  const response = await fetch(`${app.origin}/api/papers/${p.id}/pdf`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${app.token}`,
      "Content-Type": "application/pdf",
    },
    body: samplePdf(),
  });
  const data = await response.json();
  assert.equal(response.status, 200, JSON.stringify(data));
  assert.equal(data.pages.length, 1);
  const result = await client.callTool({
    name: "read_paper",
    arguments: { paperId: p.id, page: 1 },
  });
  const paper = JSON.parse(result.content[0].text);
  assert.match(paper.pages[0].text, /source passage/);
  await client.callTool({
    name: "set_context",
    arguments: { paperId: p.id, page: 1, selection: "source passage" },
  });
  const context = JSON.parse(
    (await client.callTool({ name: "get_context", arguments: {} })).content[0]
      .text,
  );
  assert.equal(context.context.selection, "source passage");
  assert.equal(context.papers.find((x) => x.id === p.id).pageCount, 1);
});
test("invalid MCP actions return isError without corrupting the workspace", async () => {
  const result = await client.callTool({
    name: "add_relation",
    arguments: {
      source: "00000000-0000-4000-8000-000000000001",
      target: "00000000-0000-4000-8000-000000000002",
      kind: "uses",
      explanation: "bad",
      evidence: "",
    },
  });
  assert.equal(result.isError, true);
  const { data } = await api("/api/state");
  assert.equal(data.relations.length, 0);
});

test("the agent can attach a local PDF without a browser upload", async () => {
  const { data: p } = await api("/api/tools/upsert_paper", {
    title: "Agent PDF import",
  });
  const file = path.join(dir, "agent-source.pdf");
  await fs.writeFile(file, samplePdf());
  const result = await client.callTool({
    name: "attach_pdf",
    arguments: { paperId: p.id, path: file },
  });
  assert.ok(!result.isError, JSON.stringify(result));
  assert.equal(JSON.parse(result.content[0].text).pageCount, 1);
  assert.ok((await fs.stat(file)).isFile());
});
