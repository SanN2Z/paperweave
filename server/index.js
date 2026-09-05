import express from "express";
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import chokidar from "chokidar";
import { configuration } from "./config.js";
import { Store } from "./store.js";
import { terminalTheme } from "./terminal-theme.js";
import { resolveShell, terminalEnvironment } from "./shell.js";
import { detectAgent, agentCommand } from "./agents.js";
import { attachmentLimit, saveTerminalAttachment } from "./terminal-attachments.js";
import { extractPdf } from "./pdf.js";
import "../scripts/prepare-pty.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const executeFile = promisify(execFile);

export async function startServer(config, { dev = false } = {}) {
  config ||= await configuration();
  const store = await new Store(config).init();
  const token = randomBytes(32).toString("hex");
  const theme = await terminalTheme({
    file: config.terminalThemeFile,
    profile: config.terminalProfile,
    appearance: config.terminalAppearance,
  });
  const preferredAgent = config.agent ? detectAgent(config.agent) : null;
  const terminalShell = await resolveShell(config);
  const app = express(),
    server = http.createServer(app),
    sockets = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  let pty;
  try {
    pty = await import("node-pty");
  } catch {
    /* UI reports native module availability. */
  }
  const origin = `http://127.0.0.1:${config.port}`;
  const origins = new Set([origin, `http://localhost:${config.port}`]);
  const hosts = new Set([
    `127.0.0.1:${config.port}`,
    `localhost:${config.port}`,
  ]);
  const validToken = (value) =>
    typeof value === "string" &&
    /^[a-f0-9]{64}$/.test(value) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(token));
  const validRequest = (req) =>
    hosts.has(req.headers.host) &&
    (!req.headers.origin || origins.has(req.headers.origin)) &&
    (!req.headers["sec-fetch-site"] ||
      ["same-origin", "none"].includes(req.headers["sec-fetch-site"]));
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    if (!validRequest(req))
      return res
        .status(403)
        .json({ error: "Local, same-origin requests only" });
    next();
  });
  app.get("/api/session", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      token,
      terminalAvailable: !!pty,
      protocol: "paperweave/1",
      terminalTheme: theme,
      preferredAgent,
      agentCommand: agentCommand(preferredAgent),
      mcpConfig: {
        command: process.execPath,
        args: [path.join(config.root, "server", "mcp.js")],
        env: { PAPERWEAVE_DATA_DIR: config.dataDir },
      },
    });
  });
  app.use("/api", (req, res, next) => {
    const auth =
      req.headers.authorization?.replace(/^Bearer /, "") || req.query.token;
    if (!validToken(auth))
      return res.status(401).json({ error: "Authentication required" });
    next();
  });
  app.get("/api/state", (_req, res) => res.json(store.snapshot()));
  app.post(
    "/api/terminal/attachments",
    express.raw({ type: "application/octet-stream", limit: attachmentLimit }),
    async (req, res) => {
      res.json(await saveTerminalAttachment(config, terminalShell.shell, req.body));
    },
  );
  app.post(
    "/api/templates/upload",
    express.raw({ type: "application/octet-stream", limit: "80mb" }),
    async (req, res) => {
      const ext = String(req.query.ext || "").toLowerCase();
      if (!["pptx", "svg"].includes(ext) || !Buffer.isBuffer(req.body))
        throw new Error("Choose a PPTX or SVG template");
      const file = path.join(
        config.dataDir,
        `upload-${randomBytes(10).toString("hex")}.${ext}`,
      );
      await fs.writeFile(file, req.body);
      try {
        res.json(
          await store.call("import_template", {
            path: file,
            title: req.query.title,
            source: req.query.source,
            license: req.query.license,
          }),
        );
      } finally {
        await fs.unlink(file);
      }
    },
  );
  app.post(
    "/api/figures/upload",
    express.raw({ type: "application/octet-stream", limit: "20mb" }),
    async (req, res) => {
      const ext = String(req.query.ext || "").toLowerCase();
      if (!["svg", "png", "jpg", "jpeg", "webp"].includes(ext))
        throw new Error("Unsupported figure format");
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        throw new Error("Choose an image file");
      const file = path.join(
        config.dataDir,
        `upload-${randomBytes(10).toString("hex")}.${ext}`,
      );
      await fs.writeFile(file, req.body);
      try {
        res.json(
          await store.call("import_figure", {
            path: file,
            title: req.query.title,
            source: req.query.source,
            paperIds: req.query.paperId ? [req.query.paperId] : [],
          }),
        );
      } finally {
        await fs.unlink(file);
      }
    },
  );
  app.post(
    "/api/tools/:name",
    express.json({ limit: "2mb" }),
    async (req, res) => res.json(await store.call(req.params.name, req.body)),
  );
  app.post(
    "/api/papers/:id/pdf",
    express.raw({ type: "application/pdf", limit: "40mb" }),
    async (req, res) => {
      if (
        !Buffer.isBuffer(req.body) ||
        !req.body.subarray(0, 5).equals(Buffer.from("%PDF-"))
      )
        return res
          .status(400)
          .json({ error: "Upload a valid PDF (maximum 40 MB)" });
      store.require("papers", req.params.id);
      const workspaceId = store.state.activeWorkspaceId;
      const pages = await extractPdf(req.body);
      res.json(
        await store.attachPdf(req.params.id, req.body, pages, workspaceId),
      );
    },
  );
  app.get("/api/files/:filename", async (req, res) => {
    const filename = req.params.filename;
    const exists =
      store.state.papers.some((p) => p.pdf === filename) ||
      store.state.figures.some(
        (f) =>
          f.filename === filename ||
          f.pptx === filename ||
          f.preview === filename,
      ) ||
      store.state.templates.some(
        (t) => t.filename === filename || t.preview === filename,
      ) ||
      store.state.manuscripts.some((m) => m.pdf === filename);
    if (
      !exists ||
      !/^[\da-f-]+\.(pdf|svg|png|jpg|jpeg|webp|pptx)$/.test(filename)
    )
      return res.sendStatus(404);
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    if (filename.endsWith(".pptx")) res.attachment(filename);
    // Managed data lives in .paperweave; Express otherwise ignores this hidden directory.
    // The authenticated reference check and strict filename allowlist above still apply.
    res.sendFile(path.join(config.dataDir, "files", filename), {
      dotfiles: "allow",
    });
  });
  app.post("/api/manuscripts/:id/compile", async (req, res) => {
    const m = await store.call("get_manuscript", {
      manuscriptId: req.params.id,
    });
    if (m.format !== "tex")
      throw new Error("Only LaTeX manuscripts can be compiled");
    const build = path.join(config.dataDir, "build", m.id);
    await fs.mkdir(build, { recursive: true });
    await fs.writeFile(path.join(build, "main.tex"), m.body, "utf8");
    try {
      const result = await executeFile(
        "pdflatex",
        [
          "-no-shell-escape",
          "-interaction=nonstopmode",
          "-halt-on-error",
          "main.tex",
        ],
        {
          cwd: build,
          timeout: 45000,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          env: {
            ...process.env,
            openin_any: "p",
            openout_any: "p",
            MIKTEX_ENABLE_INSTALLER: "0",
          },
        },
      );
      const filename = `${m.id}.pdf`;
      await fs.copyFile(
        path.join(build, "main.pdf"),
        path.join(config.dataDir, "files", filename),
      );
      await store.serialize(async () => {
        const row = store.state.manuscripts.find((x) => x.id === m.id);
        row.pdf = filename;
        row.compiledRevision = m.revision;
        await store.persist();
        store.emit("change");
      });
      res.json({
        filename,
        log: result.stdout.slice(-8000),
        revision: m.revision,
      });
    } catch (e) {
      res.status(400).json({
        error:
          e.code === "ENOENT"
            ? "未找到 pdflatex。请安装 TeX Live / MiKTeX 后重启工作台，或下载源码在现有环境中编译。"
            : `LaTeX 编译失败：${(e.stdout || e.message).slice(-8000)}`,
      });
    }
  });
  app.get("/api/notes/:id/download", async (req, res) => {
    const n = await store.call("get_note", { noteId: req.params.id });
    res
      .attachment(
        `${n.title.replace(/[^\p{L}\p{N}_ -]/gu, "").slice(0, 70) || "note"}.md`,
      )
      .type("text/markdown")
      .send(n.body);
  });
  app.get("/api/figures/:id/data", (req, res) =>
    res.json(store.require("figures", req.params.id)),
  );
  if (dev) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      root: config.root,
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
    server.on("close", () => vite.close());
  } else {
    app.use(express.static(path.join(config.root, "dist")));
    app.get("/", (_req, res) =>
      res.sendFile(path.join(config.root, "dist", "index.html")),
    );
  }
  app.use((err, _req, res, _next) => {
    console.error(err.message);
    res.status(err.status || 400).json({
      error: err.issues
        ? err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : err.message,
    });
  });
  const clients = new Set(),
    terminals = new Set();
  const broadcast = () => {
    for (const ws of clients)
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "state", state: store.snapshot() }));
  };
  store.on("change", broadcast);
  const watcher = chokidar.watch(store.notesDir, {
    ignoreInitial: true,
    depth: 0,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
  });
  watcher.on("all", (_event, file) => {
    if (/\.(md|tex)$/.test(file))
      for (const ws of clients)
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "notes_changed" }));
  });
  server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, origin);
    } catch {
      socket.destroy();
      return;
    }
    if (
      !validRequest(req) ||
      !origins.has(req.headers.origin) ||
      !validToken(url.searchParams.get("token")) ||
      !["/events", "/terminal"].includes(url.pathname)
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => {
      if (url.pathname === "/events") {
        clients.add(ws);
        ws.send(JSON.stringify({ type: "state", state: store.snapshot() }));
        ws.on("close", () => clients.delete(ws));
        return;
      }
      if (!pty) {
        ws.send(
          JSON.stringify({
            type: "error",
            message:
              "node-pty is unavailable. Install its native dependencies, or use your external CLI with MCP.",
          }),
        );
        ws.close();
        return;
      }
      if (terminals.size >= 4) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Maximum 4 terminal sessions",
          }),
        );
        ws.close();
        return;
      }
      let term;
      try {
        const { shell, args } = terminalShell;
        term = pty.spawn(shell, args, {
          name: "xterm-256color",
          cols: 100,
          rows: 24,
          cwd: config.terminalCwd,
          env: terminalEnvironment(process.env, origin),
        });
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", message: e.message }));
        ws.close();
        return;
      }
      terminals.add(term);
      ws.send(JSON.stringify({ type: "ready" }));
      const onData = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "data", data }));
      });
      term.onExit(() => {
        terminals.delete(term);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "exit" }));
          ws.close();
        }
      });
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "input" && typeof msg.data === "string")
            term.write(msg.data);
          if (
            msg.type === "resize" &&
            Number.isInteger(msg.cols) &&
            Number.isInteger(msg.rows)
          )
            term.resize(
              Math.max(10, Math.min(500, msg.cols)),
              Math.max(3, Math.min(200, msg.rows)),
            );
        } catch {}
      });
      ws.on("close", () => {
        onData.dispose();
        terminals.delete(term);
        // node-pty's Windows output worker must be released even after shell exit.
        try {
          term.kill();
        } catch {}
      });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, "127.0.0.1", resolve);
  });
  await fs.writeFile(
    path.join(config.dataDir, "runtime.json"),
    JSON.stringify({ url: origin, token, pid: process.pid }),
    { mode: 0o600 },
  );
  return {
    server,
    store,
    token,
    origin,
    close: async () => {
      await watcher.close();
      for (const ws of sockets.clients) ws.terminate();
      for (const t of terminals)
        try {
          t.kill();
        } catch {}
      sockets.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.join((await configuration()).root, "server", "index.js")
) {
  const instance = await startServer(await configuration(), {
    dev: process.argv.includes("--dev"),
  });
  console.log(`Paperweave is ready at ${instance.origin}`);
  const stop = async () => {
    await instance.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
