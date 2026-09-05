import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSZip from "jszip";
import { Store } from "../server/store.js";
let dir, store, p1, p2;
before(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-test-"));
  store = await new Store({
    dataDir: dir,
    vault: path.join(dir, "vault"),
  }).init();
});
after(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});
test("papers are source-preserving, URL-idempotent and persist across restart", async () => {
  p1 = await store.call("upsert_paper", {
    title: "Paper A",
    url: "https://example.org/a",
    abstract: "Author abstract",
    summary: "Agent interpretation",
  });
  p2 = await store.call("upsert_paper", { title: "Paper B" });
  const again = await store.call("upsert_paper", {
    title: "Paper A revised",
    url: "https://example.org/a",
  });
  assert.equal(again.id, p1.id);
  assert.equal(again.abstract, "Author abstract");
  const reopened = await new Store(store.config).init();
  assert.equal(reopened.snapshot().papers.length, 2);
  assert.equal(reopened.snapshot().papers[0].summary, "Agent interpretation");
});
test("relation validation rejects dangling edges, self edges and ungrounded verified claims", async () => {
  await assert.rejects(
    store.call("add_relation", {
      source: p1.id,
      target: p1.id,
      kind: "uses",
      explanation: "self",
      evidence: "",
    }),
  );
  await assert.rejects(
    store.call("add_relation", {
      source: p1.id,
      target: p2.id,
      kind: "uses",
      explanation: "related",
      evidence: "",
      confidence: "verified",
    }),
  );
  await store.call("add_relation", {
    source: p1.id,
    target: p2.id,
    kind: "uses",
    explanation: "related",
    evidence: "p. 3, section 2",
    confidence: "verified",
  });
  assert.equal(store.snapshot().relations.length, 1);
});
test("Obsidian changes survive stale agent writes and notes retain source provenance", async () => {
  const q = await store.call("add_question", {
    paperId: p1.id,
    question: "Why?",
    quote: "Source passage",
    page: 3,
  });
  const n = await store.call("save_note", {
    title: "Understanding",
    body: "The explanation.",
    paperIds: [p1.id],
    quote: "Source passage",
    page: 3,
    questionId: q.id,
  });
  assert.match(n.body, /Source passage/);
  assert.match(n.body, /https:\/\/example.org\/a/);
  assert.equal(store.snapshot().questions[0].status, "resolved");
  await fs.appendFile(n.path, "\nEdited in Obsidian");
  await assert.rejects(
    store.call("save_note", {
      id: n.id,
      expectedRevision: n.revision,
      title: n.title,
      body: "Overwrite",
      paperIds: [p1.id],
    }),
    /conflict/,
  );
  const latest = await store.call("get_note", { noteId: n.id });
  assert.match(latest.body, /Edited in Obsidian/);
  const merged = await store.call("save_note", {
    id: n.id,
    expectedRevision: latest.revision,
    title: n.title,
    body: latest.body + "\nMerged safely",
    paperIds: [p1.id],
  });
  assert.match(merged.body, /Merged safely/);
});
test("workspace isolation and paper focus clear stale selections", async () => {
  await store.call("set_context", {
    paperId: p1.id,
    selection: "Old passage",
    question: "Old question",
    page: 3,
  });
  await store.call("set_context", { paperId: p2.id });
  assert.equal(store.snapshot().context.selection, "");
  assert.equal(store.snapshot().context.page, 1);
  const original = store.state.activeWorkspaceId;
  await store.call("create_workspace", { title: "Another field" });
  assert.equal(store.snapshot().papers.length, 0);
  await assert.rejects(
    store.call("read_paper", { paperId: p1.id }),
    /active workspace/,
  );
  await store.call("switch_workspace", { workspaceId: original });
  assert.equal(store.snapshot().papers.length, 2);
});
test("concurrent writes are serialized without losing records", async () => {
  await Promise.all(
    Array.from({ length: 15 }, (_, i) =>
      store.call("log_activity", { message: `Parallel ${i}` }),
    ),
  );
  const persisted = JSON.parse(await fs.readFile(store.dbPath, "utf8"));
  assert.equal(
    persisted.activity.filter((a) => a.message.startsWith("Parallel ")).length,
    15,
  );
});
test("model SVG and PPTX contain editable shapes, and re-export preserves external edits", async () => {
  const f = await store.call("draw_model", {
    title: "Model",
    nodes: [
      { id: "i", label: "Input", group: "input" },
      { id: "e", label: "Encoder", group: "module" },
      { id: "o", label: "Output", group: "output" },
    ],
    edges: [
      { source: "i", target: "e" },
      { source: "e", target: "o" },
    ],
  });
  const svg = await fs.readFile(path.join(dir, "files", f.filename), "utf8");
  assert.match(svg, /Encoder/);
  const exp = await store.call("export_pptx", { figureId: f.id });
  const zip = await JSZip.loadAsync(await fs.readFile(exp.path));
  const xml = await zip.file("ppt/slides/slide1.xml").async("string");
  assert.match(xml, /Encoder/);
  assert.ok((xml.match(/<p:sp>/g) || []).length >= 6);
  await fs.appendFile(exp.path, "EXTERNAL_EDIT_MARKER");
  await store.call("export_pptx", { figureId: f.id });
  assert.ok(
    (await fs.readFile(exp.path)).includes(Buffer.from("EXTERNAL_EDIT_MARKER")),
  );
});
test("result plots validate source data dimensions and safely escape SVG content", async () => {
  await assert.rejects(
    store.call("plot_results", {
      title: "Chart",
      source: "measured.csv",
      xLabel: "Method",
      yLabel: "Score",
      chartType: "bar",
      labels: ["A", "B"],
      series: [{ name: "Test", values: [1] }],
    }),
    /one value/,
  );
  const f = await store.call("plot_results", {
    title: "<script>alert(1)</script>",
    source: "measured.csv",
    xLabel: "Method",
    yLabel: "Delta",
    chartType: "bar",
    labels: ["A", "B"],
    series: [{ name: "Test", values: [-2, 4] }],
  });
  const svg = await fs.readFile(path.join(dir, "files", f.filename), "utf8");
  assert.ok(!svg.includes("<script>"));
  assert.match(svg, /&lt;script&gt;/);
});
test("manuscript edits use optimistic concurrency and persist plain text", async () => {
  const m = await store.call("save_manuscript", {
    title: "Draft",
    format: "tex",
    body: "\\documentclass{article}",
  });
  assert.ok(m.path.endsWith(".tex"));
  await fs.appendFile(m.path, "\n% human edit");
  await assert.rejects(
    store.call("save_manuscript", {
      id: m.id,
      title: "Draft",
      format: "tex",
      body: "overwrite",
      expectedRevision: m.revision,
    }),
    /conflict/,
  );
  const actual = await store.call("get_manuscript", { manuscriptId: m.id });
  assert.match(actual.body, /human edit/);
});
