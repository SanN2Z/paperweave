import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  Network,
  FileText,
  Image,
  Terminal as TerminalIcon,
  Plus,
  Search,
  ChevronRight,
  ArrowUpRight,
  Settings,
  PanelRightClose,
  X,
  Upload,
  Download,
  Check,
  Copy,
  MessageSquare,
  Layers,
  PenLine,
  Link,
  ExternalLink,
  Activity,
  Sparkles,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  FolderOpen,
  CheckCircle2,
  Clock,
  Command,
  Maximize2,
  ArrowLeft,
} from "lucide-react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  session,
  request,
  call,
  fileUrl,
  apiUrl,
  wsUrl,
  downloadText,
} from "./api";
import "./tokens.css";
import TemplateLibrary from "./TemplateLibrary";
import "./workbench.css";
import WorkspaceTabs from "./WorkspaceTabs";
import { useDocumentScroll } from "./useWorkbenchInteraction";
import Monitor, { DesktopControls } from "./Monitor";
const PdfReader = lazy(() => import("./PdfReader"));
const TerminalDock = lazy(() => import("./TerminalDock"));
const VisualMarkdown = lazy(() => import("./VisualMarkdown"));
const statusText = { unread: "待读", reading: "精读中", reviewed: "已梳理" };
const kindText = {
  extends: "改进 / 延伸",
  supports: "支持",
  contradicts: "结论冲突",
  uses: "基于 / 使用",
  compares: "对比",
};
const noteKinds = {
  reading: "精读笔记",
  concept: "概念理解",
  discussion: "讨论记录",
  experiment: "实验记录",
};
function Markdown({ text }) {
  return (
    <div
      className="markdown"
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(marked.parse(text || "")),
      }}
    />
  );
}
function Empty({ icon: Icon = BookOpen, title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={28} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Modal({ title, onClose, children, wide = false }) {
  const dialog = useRef(null),
    close = useRef(onClose),
    previousFocus = useRef(document.activeElement);
  close.current = onClose;
  useEffect(() => {
    const previous = previousFocus.current;
    (
      dialog.current?.querySelector(
        "input:not(:disabled),textarea:not(:disabled),select:not(:disabled)",
      ) || dialog.current?.querySelector("button:not(:disabled)")
    )?.focus();
    const keyboard = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      if (e.key !== "Tab") return;
      const fields = [
        ...dialog.current.querySelectorAll(
          'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ].filter((node) => node.getClientRects().length);
      const first = fields[0],
        last = fields.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        ref={dialog}
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <header>
          <div>
            <h2>{title}</h2>
          </div>
          <button aria-label="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function App() {
  const [state, setState] = useState(null),
    [connection, setConnection] = useState("connecting"),
    [sessionData, setSessionData] = useState(null),
    [tab, setTab] = useState("graph"),
    [search, setSearch] = useState(""),
    [modal, setModal] = useState(null),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [terminal, setTerminal] = useState(true),
    [noteEpoch, setNoteEpoch] = useState(0),
    [busy, setBusy] = useState(false),
    [inspectorTab, setInspectorTab] = useState("paper");
  const reconnect = useRef(),
    loadedWorkspace = useRef();
  const terminalDockRef = useRef();
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [openedNote, setOpenedNote] = useState(null);
  const [noteDirty, setNoteDirty] = useState(false);
  const [writingFocus, setWritingFocus] = useState(false);
  function openNote(note) {
    if (
      openedNote?.id !== note.id &&
      noteDirty &&
      !confirm("当前笔记有未保存的修改，仍要打开另一篇？")
    )
      return;
    setOpenedNote(note);
    setTab("notes");
    setInspectorOpen(false);
    fire("set_context", { view: "notes" });
  }
  useEffect(() => {
    if (!inspectorOpen && !libraryOpen) return;
    const outside = (e) => {
      if (
        e.target.closest(
          ".inspector, .library, .research-panel-actions, .modal-backdrop",
        )
      )
        return;
      setInspectorOpen(false);
      setLibraryOpen(false);
    };
    const escape = (e) => {
      if (e.key === "Escape" && !e.target.closest(".modal-backdrop")) {
        setInspectorOpen(false);
        setLibraryOpen(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [inspectorOpen, libraryOpen]);
  const [draftDirty, setDraftDirty] = useState(false);
  useEffect(() => {
    if (state?.context?.view) setTab(state.context.view);
  }, [state?.context?.view]);
  useEffect(() => {
    const shortcut = (e) => {
      if (e.ctrlKey && e.code === "Backquote") {
        e.preventDefault();
        setTerminal((v) => !v);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    let closed = false,
      ws;
    const connect = async () => {
      try {
        const data = await session();
        if (closed) return;
        setSessionData(data);
        ws = new WebSocket(wsUrl("/events"));
        ws.onopen = () => setConnection("live");
        ws.onmessage = (e) => {
          const m = JSON.parse(e.data);
          if (m.type === "state") {
            setState(m.state);
            if (
              loadedWorkspace.current &&
              loadedWorkspace.current !== m.state.activeWorkspaceId
            ) {
              setModal(null);
              setOpenedNote(null);
              setNoteDirty(false);
              setTab("graph");
            }
            loadedWorkspace.current = m.state.activeWorkspaceId;
          }
          if (m.type === "notes_changed") setNoteEpoch((v) => v + 1);
        };
        ws.onclose = () => {
          setConnection("offline");
          if (!closed) reconnect.current = setTimeout(connect, 2000);
        };
      } catch (e) {
        setError(e.message);
        setConnection("offline");
        if (!closed) reconnect.current = setTimeout(connect, 2000);
      }
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(reconnect.current);
      ws?.close();
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const run = async (fn, message) => {
    try {
      const result = await fn();
      if (message) setToast(message);
      return result;
    } catch (e) {
      setError(e.message);
      throw e;
    }
  };
  const act = (name, args, message) => run(() => call(name, args), message);
  const fire = (name, args, message) => {
    act(name, args, message).catch(() => {});
  };
  const focus = (p, view) => {
    fire("set_context", { paperId: p.id, ...(view ? { view } : {}) });
    if (view) setTab(view);
    setLibraryOpen(false);
    if (!view) {
      setInspectorTab("paper");
      setInspectorOpen(true);
    }
  };
  const work = state?.workspaces.find((w) => w.id === state.activeWorkspaceId),
    paper = state?.papers.find((p) => p.id === state.context.paperId);
  const filtered =
    state?.papers.filter((p) =>
      `${p.title} ${p.authors || ""} ${(p.tags || []).join(" ")} ${p.summary}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || [];
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("已复制");
    } catch {
      setError("剪贴板不可用，请手动选择并复制。");
    }
  };
  async function submit(e, fn) {
    e.preventDefault();
    setBusy(true);
    try {
      await fn(new FormData(e.currentTarget));
      setModal(null);
    } catch {
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return (
      <div className="boot">
        <div className="brand-icon">
          <Layers />
        </div>
        <h1>Paperweave</h1>
        <p>
          {connection === "offline"
            ? "正在重新连接本地研究工作台…"
            : "正在打开你的研究空间…"}
        </p>
        {error && <small>{error}</small>}
      </div>
    );
  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand-icon" href="/" aria-label="Paperweave">
          <Layers size={24} />
        </a>
        <div className="rail-items">
          {[
            ["graph", Network, "论文脉络"],
            ["reader", BookOpen, "论文精读"],
            ["figures", Image, "科研图件"],
            ["writing", PenLine, "论文写作"],
            ["notes", FileText, "研究笔记"],
          ].map(([key, Icon, label]) => (
            <button
              key={key}
              data-tooltip={label}
              aria-label={label}
              className={tab === key ? "active" : ""}
              onClick={() => {
                setTab(key);
                fire("set_context", { view: key });
              }}
            >
              <Icon size={21} />
            </button>
          ))}
        </div>
        <div className="rail-bottom">
          <button
            title="终端"
            aria-label="终端"
            className={terminal ? "active" : ""}
            onClick={() => setTerminal((v) => !v)}
          >
            <TerminalIcon size={21} />
          </button>
          <button
            title="连接设置"
            aria-label="连接设置"
            onClick={() => setModal({ type: "settings" })}
          >
            <Settings size={20} />
          </button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb">
            <strong>Paperweave</strong>
            <span>/</span>
            <select
              aria-label="研究工作区"
              value={state.activeWorkspaceId}
              onChange={(e) => {
                if (
                  (!draftDirty && !noteDirty) ||
                  confirm("当前草稿未保存。切换研究空间会丢弃这些修改，继续？")
                )
                  fire("switch_workspace", { workspaceId: e.target.value });
              }}
            >
              {state.workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.title}
                </option>
              ))}
            </select>
            <button
              className="subtle"
              title="新建研究空间"
              aria-label="新建研究空间"
              onClick={() => setModal({ type: "workspace" })}
            >
              <Plus size={15} />
            </button>
          </div>
          <div className="top-actions">
            <DesktopControls onMonitor={() => setModal({ type: "monitor" })} />
            <span className={`connection ${connection}`}>
              <i />
              {connection === "live" ? "本地实时同步" : "连接中断 · 重连中"}
            </span>
            <button
              className="button secondary small"
              onClick={() => setModal({ type: "settings" })}
            >
              <Command size={14} /> 连接 Agent
            </button>
            <button
              className="button primary small"
              onClick={() => setModal({ type: "paper" })}
            >
              <Plus size={15} /> 添加论文
            </button>
          </div>
        </header>
        <div
          className={`workbench horizontal-workbench ${terminalMaximized && terminal ? "terminal-maximized" : ""} ${writingFocus && tab === "writing" ? "research-focused" : ""}`}
        >
          <div className="research-column">
            <WorkspaceTabs
              key={state.activeWorkspaceId}
              workspaceId={state.activeWorkspaceId}
              view={tab}
              paperTitle={paper?.title}
              onView={(view) => {
                setTab(view);
                fire("set_context", { view });
              }}
            >
              <div className="research-panel-actions">
                <button
                  aria-label="论文库"
                  aria-expanded={libraryOpen}
                  className={libraryOpen ? "selected" : ""}
                  onClick={() => {
                    setLibraryOpen((v) => !v);
                    setInspectorOpen(false);
                  }}
                  title="展开论文库"
                >
                  <FolderOpen size={16} />
                </button>
                <button
                  aria-label="展开论文详情"
                  aria-expanded={inspectorOpen && inspectorTab === "paper"}
                  onClick={() => {
                    setInspectorOpen((v) =>
                      inspectorTab === "paper" ? !v : true,
                    );
                    setInspectorTab("paper");
                    setLibraryOpen(false);
                  }}
                  title="论文详情"
                >
                  <FileText size={16} />
                </button>
                <button
                  aria-label="展开笔记"
                  aria-expanded={inspectorOpen && inspectorTab === "notes"}
                  onClick={() => {
                    setInspectorOpen((v) =>
                      inspectorTab === "notes" ? !v : true,
                    );
                    setInspectorTab("notes");
                    setLibraryOpen(false);
                  }}
                  title="笔记与讨论"
                >
                  <MessageSquare size={16} />
                </button>
              </div>
            </WorkspaceTabs>
            <div className="research-content">
              <aside className="library" hidden={!libraryOpen}>
                <div className="pane-heading">
                  <h2>
                    论文库 <span>{state.papers.length}</span>
                  </h2>
                  <button
                    aria-label="收起论文库"
                    onClick={() => setLibraryOpen(false)}
                  >
                    <X size={16} />
                  </button>
                  <button
                    aria-label="添加论文"
                    onClick={() => setModal({ type: "paper" })}
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <label className="search">
                  <Search size={15} />
                  <input
                    aria-label="搜索论文"
                    placeholder="搜索标题、作者、标签…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <div className="library-label">
                  全部论文 <span>最近更新</span>
                </div>
                <div className="paper-list">
                  {filtered.length ? (
                    filtered.map((p) => (
                      <button
                        key={p.id}
                        className={`paper-card ${paper?.id === p.id ? "selected" : ""}`}
                        onClick={() => focus(p)}
                      >
                        <div className="paper-card-meta">
                          <span className={`status ${p.status}`}>
                            <i />
                            {statusText[p.status]}
                          </span>
                          <span>{p.year || "年份待补充"}</span>
                        </div>
                        <h3>{p.title}</h3>
                        <p>
                          {p.summary ||
                            p.abstract ||
                            "等待阅读 · 让 agent 补充摘要与核心贡献"}
                        </p>
                        <div className="paper-card-footer">
                          <span>{p.tags?.[0] || "未分类"}</span>
                          <span>
                            <FileText size={12} />
                            {p.pageCount ? `${p.pageCount} 页` : "元数据"}
                          </span>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="library-empty">
                      <BookOpen size={24} />
                      <p>
                        {search ? "没有匹配的论文" : "论文会在这里慢慢积累"}
                      </p>
                      <button onClick={() => setModal({ type: "paper" })}>
                        添加第一篇 <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="library-bottom">
                  <div>
                    <span className="mini-icon">
                      <Sparkles size={15} />
                    </span>
                    <strong>让阅读留下痕迹</strong>
                  </div>
                  <p>
                    让 agent 读原文、建立关系，
                    <br />
                    把“终于懂了”留成一篇笔记。
                  </p>
                  <button onClick={() => setModal({ type: "workflow" })}>
                    查看研究工作流 <ArrowUpRight size={14} />
                  </button>
                </div>
              </aside>
              <div className="editor-column">
                <main
                  className="canvas-area"
                  id="research-panel"
                  role="tabpanel"
                  aria-labelledby={`view-tab-${tab}`}
                >
                  {tab === "graph" && (
                    <Graph
                      key={state.activeWorkspaceId}
                      onTalk={() => {
                        setTerminal(true);
                        requestAnimationFrame(() =>
                          document
                            .querySelector(
                              ".terminal-session:not([hidden]) .xterm-helper-textarea",
                            )
                            ?.focus(),
                        );
                      }}
                      state={state}
                      filtered={filtered}
                      focus={focus}
                      onAdd={() => setModal({ type: "paper" })}
                      onRelation={(pair = {}) =>
                        setModal({
                          type: "relation",
                          source: pair.source,
                          target: pair.target,
                        })
                      }
                      onArrange={(positions) =>
                        act("arrange_papers", { positions })
                      }
                    />
                  )}
                  {tab === "reader" &&
                    (paper ? (
                      <div className="reader-wrap">
                        <div className="pane-heading reader-title">
                          <div>
                            <small>READING ROOM</small>
                            <h2>{paper.title}</h2>
                          </div>
                          <button
                            className="button secondary small"
                            onClick={() => setModal({ type: "pdf", paper })}
                          >
                            <Upload size={14} />
                            {paper.pdf ? "更换 PDF" : "导入 PDF"}
                          </button>
                        </div>
                        {paper.pdf ? (
                          <Suspense
                            fallback={
                              <p className="muted padded">加载阅读器…</p>
                            }
                          >
                            <PdfReader
                              onReplace={() => setModal({ type: "pdf", paper })}
                              key={paper.id}
                              url={fileUrl(paper.pdf)}
                              page={state.context.page}
                              onPage={(page) =>
                                fire("set_context", { page, selection: "" })
                              }
                              onSelection={(selection, page) => {
                                fire("set_context", { selection, page });
                              }}
                              onDiscuss={async (selection, page) => {
                                try {
                                  await act("set_context", {
                                    selection,
                                    page,
                                    paperId: paper.id,
                                  });
                                  await act("add_question", {
                                    paperId: paper.id,
                                    question: "请结合论文上下文解读这段原文",
                                    quote: selection,
                                    page,
                                  });
                                  const prompt = `请使用 Paperweave MCP 的 get_context 读取当前论文与划选原文，结合前后文解释这段话，说明关键概念和推导；不确定的地方请明确指出。论文：${paper.title}，第 ${page} 页。`;
                                  const result =
                                    terminalDockRef.current?.discuss(prompt);
                                  setToast(
                                    result === "submitted"
                                      ? "已交给右侧 Agent 解读"
                                      : result === "pasted"
                                        ? "问题已放入终端；请在 CLI 对话中按回车发送"
                                        : "原文已保留，请打开右侧 CLI 后继续解读",
                                  );
                                } catch {}
                              }}
                            />
                          </Suspense>
                        ) : (
                          <div className="reading-summary">
                            <span className="eyebrow">PAPER OVERVIEW</span>
                            <h2>{paper.title}</h2>
                            <p className="muted">
                              {paper.authors} {paper.year && `· ${paper.year}`}
                            </p>
                            {paper.url && (
                              <a
                                className="text-link"
                                href={paper.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                打开来源 <ExternalLink size={13} />
                              </a>
                            )}
                            <section>
                              <h3>摘要</h3>
                              <Markdown
                                text={
                                  paper.abstract ||
                                  paper.summary ||
                                  "尚未补充摘要。连接 agent 或点击右侧编辑。"
                                }
                              />
                            </section>
                            <button
                              className="button secondary"
                              onClick={() => setModal({ type: "pdf", paper })}
                            >
                              <Upload size={16} /> 导入 PDF，开始划选精读
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Empty
                        title="选一篇论文，深入一点"
                        action={
                          <button
                            className="button primary"
                            onClick={() => setModal({ type: "paper" })}
                          >
                            <Plus size={15} />
                            添加论文
                          </button>
                        }
                      >
                        点击左侧论文，即可阅读原文、划选段落和记录疑问。
                      </Empty>
                    ))}
                  {tab === "figures" && (
                    <Figures
                      state={state}
                      act={act}
                      setModal={setModal}
                      copy={copy}
                    />
                  )}
                  {tab === "notes" && !openedNote && (
                    <div className="notes-view">
                      <header>
                        <h2>研究笔记</h2>
                        <button
                          className="button secondary small"
                          onClick={() => setModal({ type: "note", paper })}
                        >
                          <Plus size={15} />
                          新建笔记
                        </button>
                      </header>
                      {state.notes.length ? (
                        <div className="notes-grid">
                          {state.notes.map((note) => (
                            <button
                              key={note.id}
                              className="research-note-card"
                              onClick={() => openNote(note)}
                            >
                              <FileText size={20} />
                              <strong>{note.title}</strong>
                              <span>
                                {noteKinds[note.kind] || "研究笔记"} ·{" "}
                                {note.paperIds.length} 篇关联论文
                              </span>
                              <small>
                                {state.papers
                                  .filter((p) => note.paperIds.includes(p.id))
                                  .map((p) => p.title)
                                  .join(" · ") || "工作区笔记"}
                              </small>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <Empty title="把讨论留下来" icon={FileText}>
                          对右侧 Agent
                          说：“把刚才讨论的内容记成笔记，关联到论文。”
                        </Empty>
                      )}
                    </div>
                  )}
                  {openedNote && (
                    <div className="note-host" hidden={tab !== "notes"}>
                      <NoteEditor
                        key={openedNote.id}
                        note={openedNote}
                        epoch={noteEpoch}
                        act={act}
                        onDirty={setNoteDirty}
                        onClose={() => {
                          setOpenedNote(null);
                          setNoteDirty(false);
                        }}
                      />
                    </div>
                  )}
                  <div className="writing-host" hidden={tab !== "writing"}>
                    <Writing
                      key={state.activeWorkspaceId}
                      state={state}
                      act={act}
                      run={run}
                      epoch={noteEpoch}
                      onDirty={setDraftDirty}
                      focused={writingFocus}
                      onFocus={() => setWritingFocus((v) => !v)}
                    />
                  </div>
                </main>
              </div>
              <aside className="inspector" hidden={!inspectorOpen}>
                <div className="inspector-tabs">
                  <button
                    aria-label="收起详情面板"
                    className="close-inspector"
                    onClick={() => setInspectorOpen(false)}
                  >
                    <X size={16} />
                  </button>
                  <button
                    className={inspectorTab === "paper" ? "selected" : ""}
                    onClick={() => setInspectorTab("paper")}
                  >
                    论文详情
                  </button>
                  <button
                    className={inspectorTab === "notes" ? "selected" : ""}
                    onClick={() => setInspectorTab("notes")}
                  >
                    笔记与讨论 <span>{state.notes.length}</span>
                  </button>
                  <button
                    className={inspectorTab === "activity" ? "selected" : ""}
                    onClick={() => setInspectorTab("activity")}
                    aria-label="研究动态"
                  >
                    <Activity size={15} />
                  </button>
                </div>
                <div className="inspector-scroll">
                  {inspectorTab === "paper" &&
                    (paper ? (
                      <>
                        <div className="detail-heading">
                          <span className={`status ${paper.status}`}>
                            <i />
                            {statusText[paper.status]}
                          </span>
                          <button
                            className="text-button"
                            onClick={() => setModal({ type: "paper", paper })}
                          >
                            <PenLine size={13} /> 编辑
                          </button>
                        </div>
                        <h2 className="detail-title">{paper.title}</h2>
                        <p className="authors">
                          {paper.authors || "作者待补充"}
                          {paper.year && ` · ${paper.year}`}
                        </p>
                        <div className="tags">
                          {paper.tags?.map((t) => (
                            <span key={t}>{t}</span>
                          ))}
                        </div>
                        {paper.url && (
                          <a
                            className="source-link"
                            href={paper.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Link size={14} />
                            <span>查看论文来源</span>
                            <ArrowUpRight size={14} />
                          </a>
                        )}
                        {[
                          ["摘要", paper.abstract || paper.summary],
                          ["核心方法", paper.method],
                          ["主要发现", paper.findings],
                          ["局限与开放问题", paper.limitations],
                        ].map(([label, text]) => (
                          <section className="detail-section" key={label}>
                            <h3>{label}</h3>
                            <Markdown text={text || "尚未梳理，等待补充。"} />
                          </section>
                        ))}
                        <div className="reading-actions">
                          <button
                            className="button primary"
                            onClick={() => focus(paper, "reader")}
                          >
                            <BookOpen size={15} />
                            精读这篇论文
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => setModal({ type: "note", paper })}
                          >
                            <PenLine size={15} />
                            记一笔
                          </button>
                        </div>
                      </>
                    ) : (
                      <Empty title="思考，从连接开始" icon={Layers}>
                        选择一篇论文，查看摘要、核心贡献和它在领域中的位置。
                      </Empty>
                    ))}
                  {inspectorTab === "notes" && (
                    <>
                      {state.context.selection && (
                        <div className="selection-card">
                          <span>
                            <MessageSquare size={14} />
                            当前选中 · p. {state.context.page}
                          </span>
                          <blockquote>{state.context.selection}</blockquote>
                          <button
                            className="text-button"
                            onClick={() =>
                              fire("set_context", { selection: "" })
                            }
                          >
                            清除选中
                          </button>
                        </div>
                      )}
                      <form
                        className="question-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = e.currentTarget;
                          const question = new FormData(f).get("question");
                          act(
                            "add_question",
                            {
                              paperId: paper?.id || null,
                              question,
                              quote: state.context.selection || "",
                              page: state.context.page,
                            },
                            "问题已保存",
                          )
                            .then(() => {
                              f.reset();
                              const result = terminalDockRef.current?.discuss(
                                `请使用 Paperweave MCP 的 get_context 读取当前划选原文，直接回答我的问题：${question}。必要时用 read_paper 补全原文；不要只复述阅读状态。`,
                              );
                              setToast(
                                result === "submitted"
                                  ? "已发送给 Agent"
                                  : result === "pasted"
                                    ? "问题已放入终端，请在 CLI 对话中发送"
                                    : "问题已保留，请连接右侧 CLI",
                              );
                            })
                            .catch(() => {});
                        }}
                      >
                        <label htmlFor="question-input">哪里还没想明白？</label>
                        <textarea
                          id="question-input"
                          name="question"
                          required
                          maxLength={500}
                          placeholder="为什么这里使用这个损失函数？与上一篇有什么不同？"
                        />
                        <button className="button primary small" type="submit">
                          <Plus size={14} />
                          发送给 Agent
                        </button>
                      </form>
                      <div className="section-title">
                        <h3>研究笔记</h3>
                        <button
                          aria-label="新建笔记"
                          onClick={() => setModal({ type: "note", paper })}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                      {state.notes
                        .filter((n) => !paper || n.paperIds.includes(paper.id))
                        .map((n) => (
                          <button
                            key={n.id}
                            className="note-item"
                            onClick={() => openNote(n)}
                          >
                            <FileText size={17} />
                            <div>
                              <strong>{n.title}</strong>
                              <small>
                                {noteKinds[n.kind]} ·{" "}
                                {new Date(n.updatedAt).toLocaleDateString()}
                              </small>
                            </div>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      {!state.notes.length && (
                        <p className="muted small-text">
                          讨论后，让 agent 把理解写成笔记。也可以直接点击 +
                          记录。
                        </p>
                      )}
                      <div className="section-title">
                        <h3>待解问题</h3>
                        <span>
                          {
                            state.questions.filter((q) => q.status === "open")
                              .length
                          }
                        </span>
                      </div>
                      {state.questions
                        .filter((q) => !paper || q.paperId === paper.id)
                        .map((q) => (
                          <div
                            className={`question-item ${q.status}`}
                            key={q.id}
                          >
                            {q.status === "resolved" ? (
                              <CheckCircle2 size={15} />
                            ) : (
                              <Clock size={15} />
                            )}
                            <div>
                              {q.question}
                              <small>
                                {q.status === "resolved"
                                  ? "已沉淀为笔记"
                                  : "等待讨论"}
                                {q.page && ` · p. ${q.page}`}
                              </small>
                            </div>
                          </div>
                        ))}
                    </>
                  )}
                  {inspectorTab === "activity" && (
                    <>
                      <div className="section-title">
                        <h3>研究动态</h3>
                        <span className="live-dot" />
                      </div>
                      {state.activity.length ? (
                        state.activity.map((a) => (
                          <div className="activity-item" key={a.id}>
                            <span />
                            <div>
                              <p>{a.message}</p>
                              <small>
                                {new Date(a.createdAt).toLocaleTimeString()}
                              </small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          Agent 的阅读进展、图谱更新和你的笔记会实时出现在这里。
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="vault-footer">
                  <span className="vault-dot" />
                  <div>
                    <strong>你的笔记，留在本地</strong>
                    <small title={state.vault}>
                      Markdown · Obsidian 双向同步
                    </small>
                  </div>
                  <button
                    title="查看 Obsidian 设置"
                    onClick={() => setModal({ type: "settings" })}
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
              </aside>
            </div>
          </div>
          <Suspense
            fallback={<div className="terminal-loading">正在连接本地终端…</div>}
          >
            <TerminalDock
              ref={terminalDockRef}
              session={sessionData}
              open={terminal}
              onOpenChange={setTerminal}
              maximized={terminalMaximized}
              onMaximize={setTerminalMaximized}
            />
          </Suspense>
        </div>
      </div>
      {toast && (
        <div className="toast">
          <Check size={16} />
          {toast}
        </div>
      )}
      {error && (
        <div className="error-toast" role="alert">
          <div>{error}</div>
          <button aria-label="关闭错误" onClick={() => setError("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {modal?.type === "workspace" && (
        <Modal title="开启一个新领域" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) =>
              submit(e, async (f) =>
                act(
                  "create_workspace",
                  { title: f.get("title"), question: f.get("question") },
                  "研究空间已创建",
                ),
              )
            }
          >
            <label>
              研究领域
              <input
                name="title"
                required
                placeholder="例如：视觉语言模型的高效适配"
                autoFocus
              />
            </label>
            <label>
              这次想回答的问题
              <textarea
                name="question"
                placeholder="具体关注什么问题？希望比较哪些方法？"
              />
            </label>
            <p className="form-hint">
              每个研究空间拥有独立的论文、关系图、笔记和草稿。
            </p>
            <button className="button primary" disabled={busy}>
              创建研究空间 <ArrowRight size={15} />
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "paper" && (
        <Modal
          title={modal.paper ? "编辑论文" : "把一篇论文带进来"}
          onClose={() => setModal(null)}
          wide
        >
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const args = {
                  ...(modal.paper ? { id: modal.paper.id } : {}),
                  title: f.get("title"),
                  authors: f.get("authors"),
                  abstract: f.get("abstract"),
                  summary: f.get("summary"),
                  status: f.get("status"),
                  tags: f
                    .get("tags")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                };
                if (f.get("url")) args.url = f.get("url");
                if (f.get("year")) args.year = Number(f.get("year"));
                const p = await act("upsert_paper", args, "论文已保存");
                await act("set_context", { paperId: p.id });
              })
            }
          >
            <label>
              论文标题
              <input
                name="title"
                required
                defaultValue={modal.paper?.title}
                placeholder="完整标题"
                autoFocus
              />
            </label>
            <div className="form-row">
              <label>
                作者
                <input name="authors" defaultValue={modal.paper?.authors} />
              </label>
              <label>
                年份
                <input
                  name="year"
                  type="number"
                  min="1800"
                  max="2200"
                  defaultValue={modal.paper?.year}
                />
              </label>
            </div>
            <label>
              论文来源
              <input
                name="url"
                type="url"
                placeholder="https://arxiv.org/abs/…"
                defaultValue={modal.paper?.url}
              />
            </label>
            <label>
              原文摘要
              <textarea
                name="abstract"
                rows={3}
                defaultValue={modal.paper?.abstract}
                placeholder="粘贴摘要，或稍后让 Agent 从来源补充"
              />
            </label>
            <label>
              一句话理解
              <textarea
                name="summary"
                rows={2}
                defaultValue={modal.paper?.summary}
                placeholder="这篇论文解决了什么问题？"
              />
            </label>
            <div className="form-row">
              <label>
                标签（逗号分隔）
                <input
                  name="tags"
                  defaultValue={modal.paper?.tags?.join(", ")}
                  placeholder="多模态, 高效训练"
                />
              </label>
              <label>
                阅读状态
                <select
                  name="status"
                  defaultValue={modal.paper?.status || "unread"}
                >
                  {Object.entries(statusText).map(([k, v]) => (
                    <option value={k} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="button primary" disabled={busy}>
              {busy ? "保存中…" : "保存论文"}
              <Check size={15} />
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "pdf" && (
        <Modal title="导入论文 PDF" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const file = f.get("pdf");
                await run(
                  () =>
                    request(`/api/papers/${modal.paper.id}/pdf`, {
                      method: "POST",
                      headers: { "Content-Type": "application/pdf" },
                      body: file,
                    }),
                  "PDF 已导入，文字已提取",
                );
                setTab("reader");
              })
            }
          >
            <p className="muted">{modal.paper.title}</p>
            <label className="upload-zone">
              <Upload size={30} />
              <strong>选择本地 PDF</strong>
              <span>最多 40 MB · 保留分页原文</span>
              <input
                name="pdf"
                type="file"
                accept="application/pdf,.pdf"
                required
              />
            </label>
            <p className="form-hint">
              可选择的文本将同步给 Agent。扫描版 PDF 暂不包含 OCR。
            </p>
            <button className="button primary" disabled={busy}>
              {busy ? "正在提取全文…" : "导入并开始阅读"}
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "relation" && (
        <Modal title="连接两篇论文" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) =>
              submit(e, async (f) =>
                act("add_relation", Object.fromEntries(f), "论文关系已保存"),
              )
            }
          >
            <div className="form-row">
              {[
                ["source", "起点"],
                ["target", "终点"],
              ].map(([name, label]) => (
                <label key={name}>
                  {label}
                  <select name={name} defaultValue={modal[name] || ""}>
                    {state.papers.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <label>
              关系类型
              <select name="kind">
                {Object.entries(kindText).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              为什么相关？
              <textarea name="explanation" required maxLength={500} />
            </label>
            <label>
              原文依据
              <textarea
                name="evidence"
                placeholder="页码、段落或可以核对的证据"
              />
            </label>
            <label>
              证据状态
              <select name="confidence">
                <option value="hypothesis">待验证的联系</option>
                <option value="verified">已核实</option>
              </select>
            </label>
            <button className="button primary" disabled={busy}>
              保存关系
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "monitor" && (
        <Modal title="会话监控" onClose={() => setModal(null)}>
          <Monitor />
        </Modal>
      )}
      {modal?.type === "note" && (
        <Modal title="留住这一刻的理解" onClose={() => setModal(null)} wide>
          <form
            onSubmit={(e) =>
              submit(e, async (f) =>
                act(
                  "save_note",
                  {
                    title: f.get("title"),
                    body: f.get("body"),
                    kind: f.get("kind"),
                    paperIds: modal.paper ? [modal.paper.id] : [],
                    quote: state.context.selection || "",
                    page: state.context.page,
                  },
                  "已保存到 Obsidian Markdown",
                ),
              )
            }
          >
            <label>
              笔记标题
              <input
                name="title"
                required
                placeholder="用自己的话，说清一个问题"
                autoFocus
              />
            </label>
            <label>
              类型
              <select name="kind">
                {Object.entries(noteKinds).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              正文 · Markdown
              <textarea
                className="code-input"
                name="body"
                rows={12}
                required
                placeholder="## 我的问题\n\n## 我的理解\n\n## 还需要确认"
              />
            </label>
            {state.context.selection && (
              <blockquote className="quote-preview">
                {state.context.selection}
              </blockquote>
            )}
            <button className="button primary" disabled={busy}>
              <Check size={15} />
              保存笔记
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "settings" && (
        <Modal title="连接你的研究工具" onClose={() => setModal(null)} wide>
          <div className="setup-step">
            <span>01</span>
            <div>
              <h3>让 CLI Agent 看到这里</h3>
              {sessionData?.mcpConfig ? (
                <>
                  <p>
                    复制连接信息发给你正在使用的
                    Agent，让它接入当前研究空间。原来的对话可以继续保留。
                  </p>
                  <button
                    className="button secondary small"
                    onClick={() =>
                      copy(
                        `请把 Paperweave MCP 连接到我的当前 CLI，保留已有配置与当前会话。以下为当前研究空间的 stdio MCP 配置：\n${JSON.stringify(sessionData.mcpConfig, null, 2)}\n连接后读取 research-workflow 和 get_context，并继续回答我的问题。`,
                      )
                    }
                  >
                    <Copy size={14} />
                    复制给 Agent
                  </button>
                  <details>
                    <summary>查看 MCP 连接配置</summary>
                    <pre className="code-input">
                      {JSON.stringify(sessionData.mcpConfig, null, 2)}
                    </pre>
                  </details>
                </>
              ) : (
                <>
                  <p>
                    在项目目录运行以下命令，获取本机准确的 MCP
                    注册命令，然后重启 CLI 会话。
                  </p>
                  <div className="copy-code">
                    <code>npm run setup</code>
                    <button
                      aria-label="复制安装命令"
                      onClick={() => copy("npm run setup")}
                    >
                      <Copy size={15} />
                    </button>
                  </div>
                  <p>已支持 Codex、Claude Code 及标准 stdio MCP 客户端。</p>
                </>
              )}
            </div>
          </div>
          <div className="setup-step">
            <span>02</span>
            <div>
              <h3>连接 Obsidian vault</h3>
              <p>
                默认笔记目录：<code>{state.vault}</code>
              </p>
              <div className="copy-code">
                <code>npm run setup -- --vault "你的 vault 路径"</code>
                <button
                  aria-label="复制 Obsidian 配置命令"
                  onClick={() =>
                    copy('npm run setup -- --vault "你的 vault 路径"')
                  }
                >
                  <Copy size={15} />
                </button>
              </div>
              <p>
                重启服务后生效。已有笔记需要手动迁移 Paperweave 文件夹到新
                vault。Obsidian 中的编辑会实时显示，冲突时保留你的草稿。
              </p>
            </div>
          </div>
          <div className="setup-step">
            <span>03</span>
            <div>
              <h3>开始一次连续的研究</h3>
              <div className="prompt-card">
                使用 Paperweave，先读取 get_context 和
                research-workflow。帮我梳理这个领域：逐篇补充摘要、方法、证据和局限，建立可追溯的论文关系。遇到我不懂的概念，讨论后保存笔记。
              </div>
              <button
                className="text-button"
                onClick={() =>
                  copy(
                    "使用 Paperweave，先读取 get_context 和 research-workflow。帮我梳理当前领域：逐篇补充摘要、方法、证据和局限，建立可追溯的论文关系。遇到我不懂的概念，讨论后保存笔记。",
                  )
                }
              >
                <Copy size={13} />
                复制给 Agent
              </button>
            </div>
          </div>
          <p className="form-hint">
            真实终端：
            {sessionData?.terminalAvailable
              ? "已就绪"
              : "node-pty 未安装；可继续使用外部 CLI"}{" "}
            · 服务仅监听本机
          </p>
        </Modal>
      )}
      {modal?.type === "workflow" && (
        <Modal title="一条连贯的研究路径" onClose={() => setModal(null)}>
          <div className="workflow-list">
            {[
              [
                "01",
                "界定问题",
                "每个领域一个工作空间，先明确问题和纳入范围。",
              ],
              [
                "02",
                "读论文，留下依据",
                "原文摘要与个人理解分开；记录方法、发现、局限和页码。",
              ],
              [
                "03",
                "让关系浮现",
                "用支持、延伸、冲突和对比连接论文，标明证据是否核实。",
              ],
              [
                "04",
                "把疑问变成笔记",
                "划选原文 → 提问 → CLI 讨论 → 保存 Markdown 笔记。",
              ],
              [
                "05",
                "从理解走向产出",
                "绘制模型图、对比结果数据，写草稿，导出可编辑 PPTX。",
              ],
            ].map(([n, t, p]) => (
              <div className="setup-step" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{p}</p>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal?.type === "figure-create" && (
        <FigureCreate
          mode={modal.mode}
          paper={paper}
          act={act}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "figure-view" && (
        <Modal title={modal.figure.title} onClose={() => setModal(null)} wide>
          {modal.figure.preview || !modal.figure.filename.endsWith(".pptx") ? (
            <img
              className="figure-large"
              src={fileUrl(modal.figure.preview || modal.figure.filename)}
            />
          ) : (
            <p>可编辑 PowerPoint 工作副本</p>
          )}
          <p className="muted">{modal.figure.caption}</p>
          <p className="form-hint">
            来源：{modal.figure.source || "模型结构由用户 / Agent 提供"}
          </p>
          <a
            className="button secondary"
            href={fileUrl(modal.figure.filename)}
            download
          >
            <Download size={14} />
            下载原始图件
          </a>
        </Modal>
      )}
      {modal?.type === "template-view" && (
        <Modal title={modal.template.title} onClose={() => setModal(null)} wide>
          {modal.template.preview && (
            <img
              className="figure-large"
              src={fileUrl(modal.template.preview)}
              alt={modal.template.title}
            />
          )}
          <p>{modal.template.editable}</p>
          <p className="muted">
            {modal.template.slides.length
              ? `${modal.template.slides.length} 页 · ${modal.template.slides.reduce((n, s) => n + s.shapes + s.connectors, 0)} 个形状与连接线`
              : "SVG 矢量源文件"}
          </p>
          <p className="form-hint">
            来源：{modal.template.source}
            <br />
            使用说明：{modal.template.license}
          </p>
          <form
            onSubmit={(e) =>
              submit(e, async (form) => {
                const instructions = form.get("instructions");
                const working = await act("use_template", {
                  templateId: modal.template.id,
                });
                const prompt = `请按我的要求修改模板的矢量组件：${instructions}\n模板 ID：${modal.template.id}。工作图件 ID：${working.id}。已创建的工作副本：${working.path}。先用 get_template 查看页与组件清单、get_figure 确认副本；直接编辑这个 SVG/PPTX 的形状、连接线与文字，不要把整张图压成图片，也不要修改模板原件。完成后导出 SVG/PNG 预览并调用 refresh_figure 更新看板，保留源文件与出处。请完成实际绘图，不要只说明模板状态。`;
                const result = terminalDockRef.current?.discuss(prompt);
                setToast(
                  result === "submitted"
                    ? "已交给 Agent 绘图"
                    : result === "pasted"
                      ? "绘图要求已放入终端，请在 CLI 对话中发送"
                      : "工作副本已保存，请连接 CLI 继续绘图",
                );
              })
            }
          >
            <label>
              想怎么改这张图？
              <textarea
                name="instructions"
                required
                rows={3}
                placeholder="例如：保留双分支布局，把输入改为视频与文本，增加共享编码器，统一为蓝绿色。"
              />
            </label>
            <button className="button primary" disabled={busy}>
              <PenLine size={15} />
              用这个模板绘图
            </button>
          </form>
          <a
            className="button secondary"
            href={fileUrl(modal.template.filename)}
            download
          >
            下载模板源文件
          </a>
        </Modal>
      )}
      {modal?.type === "template-import" && (
        <Modal title="加入模板库" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const file = f.get("file");
                await run(
                  () =>
                    request(
                      `/api/templates/upload?title=${encodeURIComponent(f.get("title"))}&source=${encodeURIComponent(f.get("source"))}&license=${encodeURIComponent(f.get("license"))}&ext=${encodeURIComponent(file.name.split(".").pop())}`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/octet-stream" },
                        body: file,
                      },
                    ),
                  "模板已加入库",
                );
              })
            }
          >
            <label>
              模板标题
              <input name="title" required />
            </label>
            <label>
              来源
              <input
                name="source"
                required
                placeholder="自己的素材 / 作者与网址"
              />
            </label>
            <label>
              使用说明
              <input
                name="license"
                required
                placeholder="例如：自己的素材，仅本地使用 / CC0"
              />
            </label>
            <label>
              PPTX / SVG
              <input name="file" type="file" accept=".pptx,.svg" required />
            </label>
            <button className="button primary" disabled={busy}>
              加入模板库
            </button>
          </form>
        </Modal>
      )}
      {modal?.type === "figure-import" && (
        <Modal title="导入科研图件" onClose={() => setModal(null)}>
          <form
            onSubmit={(e) =>
              submit(e, async (f) => {
                const file = f.get("file");
                await run(
                  () =>
                    request(
                      `/api/figures/upload?title=${encodeURIComponent(f.get("title"))}&source=${encodeURIComponent(f.get("source"))}&paperId=${paper?.id || ""}&ext=${encodeURIComponent(file.name.split(".").pop())}`,
                      {
                        method: "POST",
                        headers: { "Content-Type": "application/octet-stream" },
                        body: file,
                      },
                    ),
                  "图件已导入",
                );
              })
            }
          >
            <label>
              图件标题
              <input name="title" required />
            </label>
            <label>
              来源 / 授权备注
              <input
                name="source"
                required
                placeholder="原论文 Fig. 2 / 素材网址及许可证"
              />
            </label>
            <label>
              SVG / PNG / JPEG / WebP
              <input
                name="file"
                type="file"
                required
                accept=".svg,.png,.jpg,.jpeg,.webp"
              />
            </label>
            <p className="form-hint">
              保留原始素材。SVG 作为矢量文件保存；不会自动拆成 PPT 形状。
            </p>
            <button className="button primary" disabled={busy}>
              导入图件
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Graph({
  state,
  filtered,
  focus,
  onAdd,
  onRelation,
  onTalk,
  onArrange,
}) {
  const [zoom, setZoom] = useState(1),
    [edge, setEdge] = useState(null);
  const papers = filtered;
  const [placed, setPlaced] = useState({});
  const [group, setGroup] = useState([]);
  const [linking, setLinking] = useState(null);
  const moving = useRef(null),
    moved = useRef(false);
  const graphHost = useRef();
  const [viewportWidth, setViewportWidth] = useState(960);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(entry.contentRect.width),
    );
    observer.observe(graphHost.current);
    return () => observer.disconnect();
  }, []);
  const scale = zoom * Math.min(1, Math.max(300, viewportWidth - 24) / 960);
  const positions = new Map(
    papers.map((p, i) => [
      p.id,
      placed[p.id] ||
        p.position || {
          x: 35 + (i % 3) * 310,
          y: 28 + Math.floor(i / 3) * 235 + (i % 3 === 1 ? 32 : 0),
        },
    ]),
  );
  const width = Math.max(960, ...[...positions.values()].map((p) => p.x + 290));
  const height = Math.max(
    500,
    ...[...positions.values()].map((p) => p.y + 245),
  );
  function startMove(e, paper) {
    if (e.button !== 0 || e.target.closest(".graph-port")) return;
    moved.current = false;
    const ids = group.includes(paper.id) ? group : [paper.id];
    moving.current = {
      x: e.clientX,
      y: e.clientY,
      origins: ids.map((id) => ({ id, ...positions.get(id) })),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e) {
    const drag = moving.current;
    if (!drag) return;
    const dx = (e.clientX - drag.x) / scale,
      dy = (e.clientY - drag.y) / scale;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !moved.current) return;
    moved.current = true;
    drag.latest = drag.origins.map((p) => ({
      paperId: p.id,
      x: Math.max(0, Math.min(20000, p.x + dx)),
      y: Math.max(0, Math.min(20000, p.y + dy)),
    }));
    setPlaced((old) => ({
      ...old,
      ...Object.fromEntries(
        drag.latest.map((p) => [p.paperId, { x: p.x, y: p.y }]),
      ),
    }));
  }
  function finishMove() {
    const drag = moving.current;
    moving.current = null;
    if (!drag?.latest) return;
    onArrange(drag.latest)
      .then(() =>
        setPlaced((old) => {
          const next = { ...old };
          drag.latest.forEach((p) => delete next[p.paperId]);
          return next;
        }),
      )
      .catch(() => setPlaced({}));
  }
  return (
    <div className="graph-wrap" ref={graphHost}>
      <div className="canvas-toolbar">
        <div>
          <Network size={16} />
          <strong>研究脉络</strong>
          <span className="faint">{state.relations.length} 条关系</span>
        </div>
        <div className="canvas-actions">
          <button
            className="button secondary small"
            disabled={state.papers.length < 2}
            onClick={onRelation}
          >
            <Plus size={13} />
            建立关系
          </button>
          <button
            className="text-button"
            onClick={() =>
              onArrange(
                papers.map((p, i) => ({
                  paperId: p.id,
                  x: 35 + (i % 3) * 310,
                  y: 28 + Math.floor(i / 3) * 235 + (i % 3 === 1 ? 32 : 0),
                })),
              )
                .then(() => setPlaced({}))
                .catch(() => {})
            }
          >
            自动排列
          </button>
        </div>
      </div>
      {papers.length ? (
        <div className="graph-scroll">
          <div
            className="graph-space"
            style={{ width: width * scale, height: height * scale }}
          >
            <div
              className="graph-scale"
              style={{ width, height, transform: `scale(${scale})` }}
            >
              <svg className="graph-lines" width={width} height={height}>
                {linking && (
                  <path
                    d={`M${positions.get(linking.source).x + 246} ${positions.get(linking.source).y + 98} L${linking.x} ${linking.y}`}
                    className="graph-connection-preview"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                  />
                )}
                <defs>
                  <marker
                    id="graph-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path
                      d="M1 1 L7 4 L1 7"
                      fill="none"
                      stroke="#8995bb"
                      strokeWidth="1.4"
                    />
                  </marker>
                </defs>
                {state.relations.map((r) => {
                  const s = positions.get(r.source),
                    t = positions.get(r.target);
                  if (!s || !t) return null;
                  const left = t.x > s.x,
                    x1 = s.x + (left ? 246 : 0),
                    x2 = t.x + (left ? 0 : 246),
                    y1 = s.y + 98,
                    y2 = t.y + 98;
                  return (
                    <g
                      key={r.id}
                      onClick={() => setEdge(r)}
                      className="graph-edge"
                    >
                      <path
                        d={`M${x1} ${y1} C${x1 + (left ? 80 : -80)} ${y1},${x2 + (left ? -80 : 80)} ${y2},${x2} ${y2}`}
                        fill="none"
                        stroke={
                          r.kind === "contradicts" ? "#c28b87" : "#a6b1d0"
                        }
                        strokeWidth="1.7"
                        strokeDasharray={
                          r.confidence === "hypothesis" ? "5 5" : undefined
                        }
                        markerEnd="url(#graph-arrow)"
                      />
                      <rect
                        x={(x1 + x2) / 2 - 37}
                        y={(y1 + y2) / 2 - 11}
                        width="74"
                        height="22"
                        rx="6"
                        fill="#f8f9fc"
                      />
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 + 4}
                        textAnchor="middle"
                        fill="#7d87a1"
                        fontSize="10"
                      >
                        {kindText[r.kind]}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {papers.map((p, i) => {
                const pos = positions.get(p.id);
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    data-paper-id={p.id}
                    className={`graph-node ${state.context.paperId === p.id ? "selected" : ""} ${group.includes(p.id) ? "group-selected" : ""}`}
                    style={{ left: pos.x, top: pos.y }}
                    onPointerDown={(e) => startMove(e, p)}
                    onPointerMove={move}
                    onPointerUp={finishMove}
                    onPointerCancel={() => {
                      moving.current = null;
                      setPlaced({});
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.target === e.currentTarget)
                        focus(p);
                    }}
                    onClick={(e) => {
                      if (moved.current) {
                        moved.current = false;
                        return;
                      }
                      if (e.shiftKey)
                        setGroup((ids) =>
                          ids.includes(p.id)
                            ? ids.filter((id) => id !== p.id)
                            : [...ids, p.id],
                        );
                      else {
                        setGroup([]);
                        focus(p);
                      }
                    }}
                    onDoubleClick={() => focus(p, "reader")}
                  >
                    <button
                      className="graph-port"
                      aria-label={`从 ${p.title} 拖动连线`}
                      title="拖到另一篇论文建立关系"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setLinking({
                          source: p.id,
                          x: pos.x + 246,
                          y: pos.y + 98,
                        });
                      }}
                      onPointerMove={(e) => {
                        if (!linking) return;
                        e.stopPropagation();
                        const rect = e.currentTarget
                          .closest(".graph-scale")
                          .getBoundingClientRect();
                        setLinking({
                          ...linking,
                          x: (e.clientX - rect.left) / scale,
                          y: (e.clientY - rect.top) / scale,
                        });
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        const target = document
                          .elementFromPoint(e.clientX, e.clientY)
                          ?.closest(".graph-node")?.dataset.paperId;
                        if (target && target !== p.id)
                          onRelation({ source: p.id, target });
                        setLinking(null);
                      }}
                      onPointerCancel={() => setLinking(null)}
                    />
                    <div className="node-top">
                      <span className={`node-icon color-${i % 3}`}>
                        <FileText size={16} />
                      </span>
                      <span>
                        {p.year || "PAPER"} · {p.tags[0] || "待归类"}
                      </span>
                      <ArrowUpRight size={13} />
                    </div>
                    <h3>{p.title}</h3>
                    <p>
                      {p.summary ||
                        p.abstract ||
                        "从摘要、核心方法与主要发现开始梳理。"}
                    </p>
                    <div className="node-bottom">
                      <span className={`status ${p.status}`}>
                        <i />
                        {statusText[p.status]}
                      </span>
                      <span>
                        {
                          state.notes.filter((n) => n.paperIds.includes(p.id))
                            .length
                        }{" "}
                        笔记
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="graph-empty">
          <div className="empty-constellation">
            <span>
              <FileText size={25} />
            </span>
            <i />
            <span>
              <Network size={32} />
            </span>
            <i />
            <span>
              <PenLine size={25} />
            </span>
          </div>
          <span className="eyebrow">A QUIET SPACE FOR DEEP THINKING</span>
          <h2>
            从一个问题开始，
            <br />
            展开一段研究。
          </h2>
          <p>
            直接在右侧对话，像平常使用 CLI 一样。
            <br />
            论文、脉络和讨论后的笔记，会在这里逐渐沉淀。
          </p>
          <div className="welcome-actions">
            <button className="button primary" onClick={onTalk}>
              <TerminalIcon size={17} /> 开始和 Agent 对话{" "}
              <ArrowRight size={16} />
            </button>
            <button className="text-button" onClick={onAdd}>
              添加第一篇论文
            </button>
          </div>
          <div className="empty-features">
            <span>
              <BookOpen size={15} />
              原文精读
            </span>
            <span>
              <Network size={15} />
              实时脉络
            </span>
            <span>
              <FileText size={15} />
              本地笔记
            </span>
          </div>
        </div>
      )}
      <div className="canvas-bottom">
        <small className="graph-drag-hint">
          拖动摆放 · Shift 多选组合移动 · 拖圆点连接
        </small>
        <div className="graph-legend">
          <span>
            <i />
            已核实
          </span>
          <span>
            <i className="dashed" />
            待验证
          </span>
        </div>
        <div className="zoom-controls">
          <button
            aria-label="缩小画布"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
          >
            <ZoomOut size={16} />
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button
            aria-label="放大画布"
            onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
          >
            <ZoomIn size={16} />
          </button>
          <button aria-label="重置缩放" onClick={() => setZoom(1)}>
            <Maximize2 size={15} />
          </button>
        </div>
      </div>
      {edge && (
        <div className="edge-detail">
          <button aria-label="关闭关系详情" onClick={() => setEdge(null)}>
            <X size={14} />
          </button>
          <span className="eyebrow">
            {edge.confidence === "verified" ? "已核实的关系" : "待验证的联系"}
          </span>
          <h3>{edge.explanation}</h3>
          <p>
            {edge.evidence || "暂无来源证据"}
            {edge.page && ` · p. ${edge.page}`}
          </p>
        </div>
      )}
    </div>
  );
}

function NoteEditor({ note, epoch, act, onClose, onDirty }) {
  const [record, setRecord] = useState(null),
    [body, setBody] = useState(""),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(true),
    [changed, setChanged] = useState(false);
  const dirtyRef = useRef(false);
  const documentScroll = useDocumentScroll(
    note.id,
    preview ? "preview" : "source",
  );
  useEffect(() => {
    onDirty?.(dirty);
    const guard = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  async function reload() {
    const n = await act("get_note", { noteId: note.id });
    setRecord(n);
    setBody(n.body);
    setDirty(false);
    dirtyRef.current = false;
    setChanged(false);
  }
  useEffect(() => {
    if (dirtyRef.current) {
      setChanged(true);
      return;
    }
    reload().catch(() => {});
  }, [note.id, epoch]);
  return (
    <section className="note-document" aria-label="笔记阅读与编辑">
      <header className="note-document-header">
        <button
          className="text-button"
          onClick={() => {
            if (!dirty || confirm("笔记修改尚未保存，确认返回？")) onClose();
          }}
        >
          <ArrowLeft size={16} />
          返回笔记列表
        </button>
        <span>{note.title}.md</span>
      </header>
      {changed && (
        <p className="warning">
          文件可能已在 Obsidian 或 Agent
          中更新。你的草稿已保留，保存时会检查冲突。
        </p>
      )}
      <div className="editor-toolbar">
        <button
          className="button secondary small"
          onClick={() => setPreview((v) => !v)}
        >
          {preview ? "Markdown 源码" : "可视化编辑"}
        </button>
        <a
          className="text-button"
          href={apiUrl(`/api/notes/${note.id}/download`)}
          download
        >
          <Download size={13} />
          下载
        </a>
        <button
          className="text-button"
          onClick={() => {
            if (!dirty || confirm("重新载入会替换当前未保存的草稿，继续？"))
              reload().catch(() => {});
          }}
        >
          <RefreshCw size={13} />
          重新载入
        </button>
      </div>
      {preview ? (
        <div className="note-reading-pane" {...documentScroll}>
          <article className="note-preview">
            <Suspense fallback={<p>加载编辑器…</p>}>
              <VisualMarkdown
                value={body}
                onChange={(value) => {
                  setBody(value);
                  setDirty(true);
                  dirtyRef.current = true;
                }}
              />
            </Suspense>
          </article>
        </div>
      ) : (
        <textarea
          className="note-editor code-input"
          {...documentScroll}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
            dirtyRef.current = true;
          }}
        />
      )}
      <div className="editor-footer">
        <span>{dirty ? "有未保存的修改" : "与 vault 同步"}</span>
        <button
          className="button primary"
          disabled={!record}
          onClick={() =>
            act(
              "save_note",
              {
                id: note.id,
                title: note.title,
                kind: note.kind,
                paperIds: note.paperIds,
                body,
                expectedRevision: record.revision,
              },
              "笔记已保存",
            )
              .then((n) => {
                setRecord(n);
                setBody(n.body);
                setDirty(false);
                dirtyRef.current = false;
                setChanged(false);
              })
              .catch(() => {})
          }
        >
          <Check size={14} />
          保存
        </button>
      </div>
    </section>
  );
}

function Figures({ state, act, setModal, copy }) {
  const [section, setSection] = useState("templates");
  const tabs = (
    <div className="figure-library-tabs">
      <button
        className={section === "templates" ? "selected" : ""}
        onClick={() => setSection("templates")}
      >
        模板库
      </button>
      <button
        className={section === "figures" ? "selected" : ""}
        onClick={() => setSection("figures")}
      >
        我的图件
      </button>
    </div>
  );
  if (section === "templates")
    return (
      <div className="figures-view">
        {tabs}
        <TemplateLibrary
          templates={state.templates || []}
          onOpen={(template) => setModal({ type: "template-view", template })}
          onImport={() => setModal({ type: "template-import" })}
          onUse={(template) => setModal({ type: "template-view", template })}
        />
      </div>
    );
  return (
    <div className="figures-view">
      {tabs}
      <div className="section-top">
        <div>
          <span className="eyebrow">VISUAL THINKING</span>
          <h2>把方法和结果看清楚</h2>
          <p>模型结构、矢量素材与科研结果，和论文一起保存。</p>
        </div>
        <button
          className="button secondary small"
          onClick={() => setModal({ type: "figure-import" })}
        >
          <Upload size={14} />
          导入图件
        </button>
      </div>
      <div className="figure-actions">
        <button
          onClick={() => setModal({ type: "figure-create", mode: "model" })}
        >
          <span className="mini-icon">
            <Network size={19} />
          </span>
          <div>
            <strong>绘制模型图</strong>
            <small>SVG + 可编辑 PowerPoint</small>
          </div>
          <Plus size={17} />
        </button>
        <button
          onClick={() => setModal({ type: "figure-create", mode: "chart" })}
        >
          <span className="mini-icon green">
            <Activity size={19} />
          </span>
          <div>
            <strong>绘制结果图</strong>
            <small>保留原始数据与来源</small>
          </div>
          <Plus size={17} />
        </button>
      </div>
      {state.figures.length ? (
        <div className="figure-grid">
          {state.figures.map((f) => (
            <article className="figure-card" key={f.id}>
              <button
                className="figure-preview"
                onClick={() => setModal({ type: "figure-view", figure: f })}
              >
                {f.preview || !f.filename.endsWith(".pptx") ? (
                  <img src={fileUrl(f.preview || f.filename)} alt={f.title} />
                ) : (
                  <Layers size={48} />
                )}
              </button>
              <div className="figure-info">
                <span className="eyebrow">
                  {f.kind === "model"
                    ? "MODEL ARCHITECTURE"
                    : f.kind === "chart"
                      ? "EXPERIMENT RESULTS"
                      : "REFERENCE ASSET"}
                </span>
                <h3>{f.title}</h3>
                <p>{f.caption || f.source || "结构与源文件已保留"}</p>
                <div>
                  <a href={fileUrl(f.filename)} download title="下载图件">
                    <Download size={15} />
                  </a>
                  {f.kind !== "figure" && (
                    <button
                      title="下载源数据"
                      onClick={() =>
                        downloadText(
                          `${f.title}.json`,
                          JSON.stringify(f, null, 2),
                          "application/json",
                        )
                      }
                    >
                      <FileText size={15} />
                    </button>
                  )}
                  {f.kind === "model" && (
                    <button
                      className="text-button"
                      onClick={() =>
                        act(
                          "export_pptx",
                          { figureId: f.id },
                          "PPTX 已生成，形状和文字均可编辑",
                        )
                          .then((r) => {
                            const a = document.createElement("a");
                            a.href = fileUrl(r.filename);
                            a.download = r.filename;
                            a.click();
                          })
                          .catch(() => {})
                      }
                    >
                      导出 PPTX <ArrowUpRight size={13} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={Image} title="让图件成为研究的一部分">
          导入参考矢量图，或让 Agent 调用 draw_model /
          plot_results。图件生成后会自动出现在这里。
        </Empty>
      )}
      <div className="figure-tip">
        <Layers size={19} />
        <p>
          <strong>保留你的 PPT 绘图习惯</strong>
          <br />
          模型图导出为原生形状，CLI 可以继续编辑 PPTX；外部 SVG
          保留为矢量素材。Agent 可从 export_pptx 返回值获得本地文件路径。
        </p>
      </div>
    </div>
  );
}

function FigureCreate({ mode, paper, act, onClose }) {
  const model = mode === "model";
  const initial = model
    ? {
        nodes: [
          { id: "input", label: "Input", group: "input" },
          { id: "encoder", label: "Encoder", group: "module" },
          { id: "output", label: "Output", group: "output" },
        ],
        edges: [
          { source: "input", target: "encoder", label: "" },
          { source: "encoder", target: "output", label: "" },
        ],
      }
    : {
        chartType: "bar",
        xLabel: "Method",
        yLabel: "Accuracy (%)",
        labels: [],
        series: [{ name: "Measured", values: [] }],
      };
  const [json, setJson] = useState(JSON.stringify(initial, null, 2)),
    [error, setError] = useState("");
  return (
    <Modal
      title={model ? "绘制模型结构" : "从真实数据绘制结果"}
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const f = new FormData(e.currentTarget),
              spec = JSON.parse(json);
            await act(
              model ? "draw_model" : "plot_results",
              {
                ...spec,
                title: f.get("title"),
                caption: f.get("caption"),
                paperIds: paper ? [paper.id] : [],
                ...(!model ? { source: f.get("source") } : {}),
              },
              "图件已生成",
            );
            onClose();
          } catch (e) {
            setError(e.message);
          }
        }}
      >
        <label>
          图件标题
          <input
            name="title"
            required
            placeholder={model ? "例如：方法总体框架" : "例如：消融实验结果"}
          />
        </label>
        <label>
          {model ? "结构说明 / 论文出处" : "结果说明"}
          <input
            name="caption"
            placeholder="标注原论文图号，或注明这是你自己的设计"
          />
        </label>
        {!model && (
          <label>
            数据来源
            <input
              name="source"
              required
              placeholder="例如：runs/ablation.csv，seed=42；或论文 Table 2"
            />
          </label>
        )}
        <label>
          {model
            ? "编辑结构 · 模板仅用于起步"
            : "粘贴真实数据 · labels 与 values 数量须一致"}
          <textarea
            className="code-input"
            rows={14}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </label>
        {error && <p className="error-box">{error}</p>}
        <button className="button primary">
          生成图件 <ArrowRight size={14} />
        </button>
      </form>
    </Modal>
  );
}

const texTemplate =
  "\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\title{A Research Paper}\n\\author{}\n\\date{}\n\\begin{document}\n\\maketitle\n\\begin{abstract}\nDescribe the research question, method, and verified findings.\n\\end{abstract}\n\\section{Introduction}\n% Write the motivation and the gap. Cite verified sources.\n\n\\section{Related Work}\n\n\\section{Method}\n\n\\section{Experiments}\n% Insert measured results, not placeholders presented as data.\n\n\\section{Conclusion}\n\n\\end{document}\n";
function Writing({ state, act, run, epoch, onDirty, focused, onFocus }) {
  const [showOutline, setShowOutline] = useState(false);
  const [selected, setSelected] = useState(null),
    [record, setRecord] = useState(null),
    [body, setBody] = useState(""),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState("source"),
    [compiling, setCompiling] = useState(false),
    [pdfPage, setPdfPage] = useState(1),
    [changed, setChanged] = useState(false);
  const dirtyRef = useRef(false);
  const editorRef = useRef();
  const documentScroll = useDocumentScroll(selected, preview);
  const bindEditor = useCallback(
    (node) => {
      editorRef.current = node;
      documentScroll.ref(node);
    },
    [documentScroll.ref],
  );
  const outline = [
    ...body.matchAll(/^(?:#{1,3}\s+(.+)|\\(?:sub)*section\*?\{([^}]+)\})/gm),
  ].map((m) => ({ title: m[1] || m[2], offset: m.index }));
  useEffect(() => {
    onDirty(dirty);
    const guard = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const doc = state.manuscripts.find((m) => m.id === selected);
  async function load(id) {
    const m = await act("get_manuscript", { manuscriptId: id });
    setSelected(id);
    setRecord(m);
    setBody(m.body);
    setDirty(false);
    dirtyRef.current = false;
    setChanged(false);
    setPdfPage(1);
    await act("set_context", { manuscriptId: id });
  }
  useEffect(() => {
    if (selected) {
      if (dirtyRef.current) setChanged(true);
      else load(selected).catch(() => {});
    }
  }, [epoch]);
  useEffect(() => {
    if (selected && !dirtyRef.current) load(selected).catch(() => {});
  }, [doc?.updatedAt]);
  async function create(format) {
    if (dirty && !confirm("切换草稿会丢失未保存修改，继续？")) return;
    const m = await act(
      "save_manuscript",
      {
        title: format === "tex" ? "论文草稿" : "研究写作笔记",
        format,
        body:
          format === "tex"
            ? texTemplate
            : "# 研究草稿\n\n## 研究问题\n\n## 核心贡献\n\n## 证据与待确认事项\n",
      },
      "草稿已创建",
    );
    await load(m.id);
  }
  async function save() {
    const m = await act(
      "save_manuscript",
      {
        id: record.id,
        expectedRevision: record.revision,
        title: record.title,
        format: record.format,
        body,
      },
      "草稿已保存",
    );
    setRecord(m);
    setBody(m.body);
    setDirty(false);
    dirtyRef.current = false;
    setChanged(false);
    return m;
  }
  async function compile() {
    setCompiling(true);
    try {
      if (dirty) await save();
      await run(
        () =>
          request(`/api/manuscripts/${record.id}/compile`, { method: "POST" }),
        "PDF 已编译",
      );
      setPreview("preview");
    } catch {
    } finally {
      setCompiling(false);
    }
  }
  return (
    <div className={`writing-view ${record ? "has-manuscript" : ""}`}>
      <div className="section-top">
        <div>
          <span className="eyebrow">FROM THINKING TO WRITING</span>
          <h2>让研究，自然写成论文。</h2>
          <p>草稿、文献和 Agent 的上下文，留在同一个空间。</p>
        </div>
      </div>
      <div className="writing-bar">
        <select
          aria-label="论文草稿"
          value={selected || ""}
          onChange={(e) => {
            if (
              e.target.value &&
              (!dirty || confirm("切换将丢弃未保存修改，继续？"))
            )
              load(e.target.value).catch(() => {});
          }}
        >
          <option value="">选择草稿</option>
          {state.manuscripts.map((m) => (
            <option key={m.id} value={m.id}>
              {m.title}.{m.format}
            </option>
          ))}
        </select>
        <button
          className="button secondary small"
          onClick={() => create("tex").catch(() => {})}
        >
          <Plus size={13} />
          LaTeX
        </button>
        <button
          className="button secondary small"
          onClick={() => create("md").catch(() => {})}
        >
          <Plus size={13} />
          Markdown
        </button>
      </div>
      {record ? (
        <>
          <div className="editor-toolbar">
            <span className="faint">{dirty ? "未保存" : "已保存"}</span>
            <button
              className="text-button"
              aria-label="重新载入草稿"
              title="重新载入草稿"
              onClick={() => {
                if (!dirty || confirm("重新载入会替换你的未保存草稿，继续？"))
                  load(selected).catch(() => {});
              }}
            >
              <RefreshCw size={13} />
            </button>
            <button
              className="text-button"
              aria-label="下载草稿"
              title="下载草稿"
              onClick={() =>
                downloadText(`${record.title}.${record.format}`, body)
              }
            >
              <Download size={14} />
            </button>
            <button
              className="button primary small"
              onClick={() => save().catch(() => {})}
            >
              <Check size={13} />
              保存
            </button>
          </div>
          {changed && (
            <p className="warning">
              源文件有新变化。当前草稿已保留；保存时会检查版本冲突。
            </p>
          )}
          <div className="writing-mode">
            <button
              className={showOutline ? "selected" : ""}
              onClick={() => setShowOutline((v) => !v)}
              aria-expanded={showOutline}
            >
              章节
            </button>
            <button
              className={preview === "source" ? "selected" : ""}
              onClick={() => setPreview("source")}
            >
              源码
            </button>
            <button
              className={preview === "preview" ? "selected" : ""}
              onClick={() => setPreview("preview")}
            >
              预览
            </button>
            {record.format === "tex" && (
              <button
                className="text-button"
                disabled={compiling}
                onClick={compile}
              >
                <RefreshCw size={13} />
                {compiling ? "编译中…" : "编译 PDF"}
              </button>
            )}
            <small>
              {record.format === "tex"
                ? "LaTeX · 本地 pdflatex"
                : "Markdown · 实时预览"}
            </small>
            <button className="text-button" onClick={onFocus}>
              <Maximize2 size={14} />
              {focused ? "退出专注" : "专注写作"}
            </button>
          </div>
          <div className="manuscript-content">
            {showOutline && outline.length > 0 && preview === "source" && (
              <nav className="writing-outline" aria-label="章节导航">
                {outline.map((section, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      editorRef.current.focus();
                      editorRef.current.setSelectionRange(
                        section.offset,
                        section.offset + section.title.length,
                      );
                      const line = body
                        .slice(0, section.offset)
                        .split("\n").length;
                      editorRef.current.scrollTop = Math.max(
                        0,
                        (line - 3) * 22,
                      );
                    }}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            )}
            {preview === "source" ? (
              <textarea
                ref={bindEditor}
                onScroll={documentScroll.onScroll}
                spellCheck="false"
                className="manuscript-editor"
                onMouseUp={(e) => {
                  const text = e.currentTarget.value.slice(
                    e.currentTarget.selectionStart,
                    e.currentTarget.selectionEnd,
                  );
                  if (text)
                    act("set_context", {
                      manuscriptId: record.id,
                      manuscriptSelection: text.slice(0, 10000),
                    }).catch(() => {});
                }}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setDirty(true);
                  dirtyRef.current = true;
                }}
              />
            ) : record.format === "md" ? (
              <div className="manuscript-preview" {...documentScroll}>
                <Suspense fallback={<p>加载编辑器…</p>}>
                  <VisualMarkdown
                    value={body}
                    onChange={(value) => {
                      setBody(value);
                      setDirty(true);
                      dirtyRef.current = true;
                    }}
                  />
                </Suspense>
              </div>
            ) : doc?.pdf ? (
              <Suspense fallback={<p>加载 PDF…</p>}>
                <PdfReader
                  url={fileUrl(doc.pdf) + `&revision=${doc.compiledRevision}`}
                  page={pdfPage}
                  onPage={setPdfPage}
                />
                {(dirty || doc.compiledRevision !== record.revision) && (
                  <p className="warning">
                    预览对应上次编译的版本，请重新编译查看最新修改。
                  </p>
                )}
              </Suspense>
            ) : (
              <Empty icon={FileText} title="编译后在这里预览 PDF">
                使用本机 pdflatex 编译；也可以下载
                .tex，在你已有的写作环境中继续。
              </Empty>
            )}
          </div>
          <div className="writing-foot">
            <FileText size={13} />
            <input
              aria-label="草稿标题"
              title="修改草稿标题后保存"
              className="draft-title"
              value={record.title}
              style={{
                width: `${Math.min(32, Math.max(12, record.title.length + 4))}em`,
              }}
              onChange={(e) => {
                setRecord({ ...record, title: e.target.value });
                setDirty(true);
                dirtyRef.current = true;
              }}
            />
            <span title={record.path}>.{record.format} · 本地文件</span>
            <button
              className="text-button"
              onClick={() =>
                downloadText(
                  "references.bib",
                  state.papers
                    .map(
                      (p) =>
                        `@misc{paper${p.id.replaceAll("-", "")},\n  title = {${p.title.replace(/[{}\\]/g, "")}},\n  author = {${(p.authors || "").replace(/[{}\\]/g, "")}},\n  year = {${p.year || ""}},\n  url = {${p.url || ""}}\n}`,
                    )
                    .join("\n\n"),
                )
              }
            >
              导出 BibTeX
            </button>
          </div>
        </>
      ) : (
        <Empty
          icon={PenLine}
          title="给你的研究，一个开始落笔的地方"
          action={
            <button
              className="button primary"
              onClick={() => create("tex").catch(() => {})}
            >
              <Plus size={15} />
              创建 LaTeX 草稿
            </button>
          }
        >
          选择已有草稿，或创建新稿。让 Agent
          从论文与笔记中组织章节，再和你一起逐段修改。
        </Empty>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  new URLSearchParams(location.search).has("monitor") ? (
    <Monitor standalone />
  ) : (
    <App />
  ),
);
