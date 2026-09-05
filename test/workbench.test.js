import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Store } from "../server/store.js";
import { root } from "../server/config.js";
import { shellCommand, terminalEnvironment } from "../server/shell.js";
import { projectDataDir } from "../server/project.js";
import { samplePdf } from "./fixtures.js";
const execute = promisify(execFile);

test("ARIS source adapter discovers canonical files, rejects traversal and refreshes PDFs without duplication", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-harness-"));
  try {
    await fs.mkdir(path.join(dir, "papers"));
    await fs.mkdir(path.join(dir, "idea-stage"));
    await fs.writeFile(path.join(dir, "papers", "fixture.pdf"), samplePdf(2));
    await fs.writeFile(
      path.join(dir, "idea-stage", "IDEA_REPORT.md"),
      "# Existing report\nSource remains canonical.",
    );
    const store = await new Store({
      root,
      projectRoot: dir,
      dataDir: path.join(dir, ".paperweave"),
      vault: path.join(dir, "paperweave/vault"),
    }).init();
    const index = await store.call("scan_project", {});
    assert.equal(index.harness, "aris");
    assert.equal(index.artifacts.length, 2);
    const report = await store.call("read_project_artifact", {
      path: "idea-stage/IDEA_REPORT.md",
    });
    assert.match(report.body, /canonical/);
    await assert.rejects(
      store.call("read_project_artifact", { path: "../outside.md" }),
    );
    const first = await store.call("import_project_paper", {
      path: "papers/fixture.pdf",
    });
    const duplicate = await store.call("import_project_paper", {
      path: "papers/fixture.pdf",
    });
    assert.equal(first.id, duplicate.id);
    assert.equal(first.pageCount, 2);
    await fs.writeFile(path.join(dir, "papers", "fixture.pdf"), samplePdf(3));
    const updated = await store.call("import_project_paper", {
      path: "papers/fixture.pdf",
    });
    assert.equal(updated.id, first.id);
    assert.equal(updated.pageCount, 3);
    assert.equal(store.snapshot().papers.length, 1);
    assert.equal(
      await fs.readFile(path.join(dir, "idea-stage/IDEA_REPORT.md"), "utf8"),
      report.body,
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("templates preserve editable source, provenance and independent working copies", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-templates-"));
  try {
    const store = await new Store({
      root,
      dataDir: dir,
      vault: path.join(dir, "vault"),
    }).init();
    assert.equal((await store.call("list_templates", {})).templates.length, 11);
    const model = await store.call("draw_model", {
      title: "Editable fixture",
      nodes: [
        { id: "a", label: "Input", group: "input" },
        { id: "b", label: "Encoder", group: "module" },
      ],
      edges: [{ source: "a", target: "b" }],
    });
    const pptx = await store.call("export_pptx", { figureId: model.id });
    const original = await fs.readFile(pptx.path);
    const template = await store.call("import_template", {
      title: "Native fixture",
      path: pptx.path,
      source: "Synthetic test",
      license: "Test only",
      tags: ["test"],
    });
    assert.equal(template.slides.length, 1);
    assert.ok(template.slides[0].shapes >= 2);
    assert.match(template.slides[0].text, /Encoder/);
    assert.equal(
      (
        await store.call("import_template", {
          title: "Duplicate",
          path: pptx.path,
          source: "Synthetic test",
          license: "Test only",
        })
      ).id,
      template.id,
    );
    const copy = await store.call("use_template", { templateId: template.id });
    assert.deepEqual(await fs.readFile(copy.path), original);
    await fs.appendFile(copy.path, Buffer.from("local edit"));
    const source = await store.call("get_template", {
      templateId: template.id,
    });
    assert.deepEqual(await fs.readFile(source.path), original);
    assert.equal(
      store.snapshot().figures.find((f) => f.id === copy.id).source,
      "Synthetic test",
    );
    const paper = await store.call("upsert_paper", { title: "Movable paper" });
    await store.call("arrange_papers", {
      positions: [{ paperId: paper.id, x: 125, y: 310 }],
    });
    const reopened = await new Store(store.config).init();
    assert.deepEqual(reopened.snapshot().papers[0].position, {
      x: 125,
      y: 310,
    });
    assert.equal(reopened.state.templates.length, 12);
    const working = await store.call("get_figure", { figureId: copy.id });
    assert.equal(working.path, copy.path);
    const previewPath = path.join(dir, "preview.svg");
    await fs.writeFile(
      previewPath,
      '<svg xmlns="http://www.w3.org/2000/svg"><text>Updated</text></svg>',
    );
    const refreshed = await store.call("refresh_figure", {
      figureId: copy.id,
      previewPath,
    });
    assert.equal(refreshed.filename, copy.filename);
    assert.match(
      await fs.readFile(path.join(dir, "files", refreshed.preview), "utf8"),
      /Updated/,
    );
    await assert.rejects(
      store.call("arrange_papers", {
        positions: [{ paperId: paper.id, x: -1, y: 2 }],
      }),
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("shell profile loading preserves aliases and proxy environment while isolating CLI nesting markers", () => {
  assert.deepEqual(shellCommand({}, "win32", {}).args, ["-NoLogo"]);
  assert.deepEqual(shellCommand({}, "linux", { SHELL: "/bin/zsh" }), {
    shell: "/bin/zsh",
    args: ["-l"],
  });
  assert.deepEqual(
    shellCommand(
      { terminalShell: "pwsh.exe", terminalShellArgs: ["-NoLogo", "-Login"] },
      "win32",
      {},
    ).args,
    ["-NoLogo", "-Login"],
  );
  const env = terminalEnvironment(
    {
      PATH: "native-path",
      HTTPS_PROXY: "http://127.0.0.1:1234",
      CLAUDECODE: "1",
      NO_COLOR: "1",
    },
    "http://127.0.0.1:47831",
  );
  assert.equal(env.PATH, "native-path");
  assert.equal(env.HTTPS_PROXY, "http://127.0.0.1:1234");
  assert.equal(env.CLAUDECODE, undefined);
  assert.equal(env.NO_COLOR, undefined);
  assert.equal(env.FORCE_COLOR, "3");
});

test("project initialization preserves experiments and MCP entries, and bridges an existing session", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-project-"));
  let pid;
  const env = { ...process.env };
  delete env.PAPERWEAVE_DATA_DIR;
  delete env.PAPERWEAVE_PROJECT;
  delete env.PAPERWEAVE_PORT;
  try {
    await fs.writeFile(
      path.join(dir, "experiment.py"),
      "# existing experiment\n",
    );
    await fs.writeFile(
      path.join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { existing: { command: "keep-me" } } }),
    );
    const run = () =>
      execute(
        process.execPath,
        [
          path.join(root, "scripts/project.js"),
          "init",
          "--project",
          dir,
          "--no-browser",
        ],
        { cwd: root, env, windowsHide: true, timeout: 30000 },
      );
    const first = await run();
    const runtime = JSON.parse(
      await fs.readFile(path.join(dir, ".paperweave/runtime.json"), "utf8"),
    );
    pid = runtime.pid;
    assert.ok(!first.stdout.includes(runtime.token));
    await run();
    assert.equal(
      JSON.parse(
        await fs.readFile(path.join(dir, ".paperweave/runtime.json"), "utf8"),
      ).pid,
      pid,
    );
    assert.equal(
      await fs.readFile(path.join(dir, "experiment.py"), "utf8"),
      "# existing experiment\n",
    );
    const mcp = JSON.parse(
      await fs.readFile(path.join(dir, ".mcp.json"), "utf8"),
    );
    assert.equal(mcp.mcpServers.existing.command, "keep-me");
    assert.equal(mcp.mcpServers.paperweave.env.PAPERWEAVE_PROJECT, dir);
    const toml = await fs.readFile(
      path.join(dir, ".codex/config.toml"),
      "utf8",
    );
    assert.equal(toml.split("[mcp_servers.paperweave]").length - 1, 1);
    const nested = path.join(dir, "experiments");
    await fs.mkdir(nested);
    assert.equal(
      await projectDataDir(nested, {}),
      path.join(dir, ".paperweave"),
    );
    const result = await execute(
      process.execPath,
      [path.join(root, "scripts/project.js"), "context", "--project", dir],
      { env, windowsHide: true, timeout: 10000 },
    );
    const context = JSON.parse(result.stdout);
    assert.equal(context.protocol, "paperweave/1");
    assert.match(context.instructions, /explain the selected passage/);
    assert.ok(!result.stdout.includes(runtime.token));
  } finally {
    if (pid) {
      try {
        process.kill(pid);
      } catch {}
    }
    // Wait for the temporary detached server to release its files before removal.
    await new Promise((r) => setTimeout(r, 300));
    await fs.rm(dir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});
