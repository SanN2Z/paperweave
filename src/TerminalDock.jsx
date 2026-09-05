import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Terminal,
  Plus,
  Columns2,
  ChevronDown,
  ChevronUp,
  X,
  Maximize2,
  Minimize2,
  Keyboard,
} from "lucide-react";
import TerminalPane from "./TerminalPane";
import { useDismissable } from "./useWorkbenchInteraction";
import { creamTheme, darkTheme } from "../shared/terminal-themes";

export default forwardRef(function TerminalDock(
  { open, onOpenChange, maximized, onMaximize, session },
  ref,
) {
  const panes = useRef(new Map());
  const [sessions, setSessions] = useState([
    {
      id: 1,
      title:
        session?.preferredAgent === "codex"
          ? "Codex"
          : session?.preferredAgent === "claude"
            ? "Claude Code"
            : "Terminal 1",
      command: session?.agentCommand || null,
    },
  ]);
  const [active, setActive] = useState(1),
    [split, setSplit] = useState(false),
    [menu, setMenu] = useState(false);
  const [shortcutHelp, setShortcutHelp] = useState(false);
  const launcherRef = useDismissable(menu, () => setMenu(false));
  const [splitIds, setSplitIds] = useState([]);
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem("paperweave.terminalWidth"));
    return saved >= 340 && saved <= 1000
      ? saved
      : Math.max(380, Math.round(window.innerWidth * 0.36));
  });
  const nextId = useRef(2),
    dock = useRef(),
    drag = useRef(null);
  const [themeChoice, setThemeChoice] = useState(() => {
    const saved = localStorage.getItem("paperweave.terminalTheme");
    return ["local", "cream", "dark"].includes(saved) ? saved : "local";
  });
  const palette =
    themeChoice === "dark"
      ? darkTheme
      : themeChoice === "cream"
        ? creamTheme
        : session?.terminalTheme?.colors || creamTheme;
  const clamp = (v) =>
    Math.min(
      Math.max(340, v),
      Math.max(340, (dock.current?.parentElement.clientWidth || 1200) * 0.6),
    );
  const resize = (value) => {
    const w = clamp(value);
    setWidth(w);
    localStorage.setItem("paperweave.terminalWidth", String(w));
  };
  const add = (command = null, shouldSplit = false) => {
    if (sessions.length >= 4) return;
    const id = nextId.current++;
    setSessions((s) => [
      ...s,
      {
        id,
        title:
          command === "codex"
            ? "Codex"
            : command === "claude"
              ? "Claude Code"
              : `Terminal ${id}`,
        command,
      },
    ]);
    setActive(id);
    if (shouldSplit) setSplitIds([active, id].filter(Boolean));
    setSplit(shouldSplit);
    setMenu(false);
    onOpenChange(true);
  };
  const close = (id) => {
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (active === id) setActive(remaining.at(-1)?.id);
    if (remaining.length < 2 || splitIds.includes(id)) setSplit(false);
  };
  const other = sessions.find((s) => s.id !== active)?.id;
  useImperativeHandle(ref, () => ({
    discuss(text) {
      const agent =
        sessions.find(
          (s) => s.id === active && /^(codex|claude)\b/.test(s.command || ""),
        ) || sessions.find((s) => /^(codex|claude)\b/.test(s.command || ""));
      const target = agent || sessions.find((s) => s.id === active);
      if (!target) return "unavailable";
      onOpenChange(true);
      focusSession(target.id);
      // Without bracketed-paste support, an embedded newline can execute a shell
      // command even when no Enter is appended. Flatten this handoff only.
      const payload = agent ? text : text.replace(/[\r\n]+/g, " ");
      return panes.current.get(target.id)?.send(payload, !!agent)
        ? agent
          ? "submitted"
          : "pasted"
        : "unavailable";
    },
  }));
  function focusSession(id) {
    if (split && !splitIds.includes(id))
      setSplitIds([splitIds.find((x) => x !== active), id].filter(Boolean));
    setActive(id);
    requestAnimationFrame(() =>
      dock.current
        ?.querySelector(`[data-session-id="${id}"] .xterm-helper-textarea`)
        ?.focus(),
    );
  }
  function shortcut(e) {
    if (e.isComposing || e.target.closest("select")) return;
    const key = e.key.toLowerCase();
    let action;
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
      if (key === "d" || e.code === "Digit5") action = () => add(null, true);
      if (key === "t" || e.code === "Backquote") action = () => add();
      if (key === "w")
        action = () => {
          const remaining = sessions.filter((s) => s.id !== active);
          close(active);
          if (remaining.length) focusSession(remaining.at(-1).id);
        };
    }
    if (
      (e.altKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        ["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) ||
      (e.ctrlKey && !e.shiftKey && ["pageup", "pagedown"].includes(key))
    ) {
      action = () => {
        const candidates =
          e.altKey && split
            ? sessions.filter((s) => splitIds.includes(s.id))
            : sessions;
        const index = candidates.findIndex((s) => s.id === active);
        const direction = ["arrowleft", "arrowup", "pageup"].includes(key)
          ? -1
          : 1;
        const target =
          candidates[
            (index + direction + candidates.length) % candidates.length
          ];
        if (target) focusSession(target.id);
      };
    }
    if (e.altKey && key === "enter") action = () => onMaximize(!maximized);
    if (action) {
      e.preventDefault();
      e.stopPropagation();
      action();
    }
  }
  return (
    <section
      ref={dock}
      onKeyDownCapture={shortcut}
      className={`terminal-dock ${open ? "is-open" : "is-hidden"} ${maximized ? "is-maximized" : ""}`}
      style={{
        "--terminal-width": `${width}px`,
        "--terminal-bg": palette.background,
        "--terminal-fg": palette.foreground,
        "--terminal-cursor": palette.cursor || palette.foreground,
      }}
      aria-label="集成终端"
    >
      {open && !maximized && (
        <div
          className="terminal-resizer"
          role="separator"
          aria-label="调整终端宽度"
          aria-orientation="vertical"
          aria-valuemin={340}
          aria-valuemax={Math.round(
            Math.max(
              340,
              (dock.current?.parentElement.clientWidth || 1200) * 0.6,
            ),
          )}
          aria-valuenow={Math.round(width)}
          tabIndex={0}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, width };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              resize(drag.current.width + drag.current.x - e.clientX);
          }}
          onPointerUp={(e) => {
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
              e.preventDefault();
              resize(width + (e.key === "ArrowLeft" ? 20 : -20));
            }
          }}
        />
      )}
      <header className="terminal-dock-header">
        <button
          className="terminal-toggle dock-label"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <Terminal size={14} />
          <span>终端</span>
          <kbd>Ctrl + `</kbd>
        </button>
        {open && (
          <div className="terminal-tabs" role="tablist" aria-label="终端会话">
            {sessions.map((s) => (
              <div
                className={`terminal-tab ${active === s.id ? "active" : ""}`}
                key={s.id}
              >
                <button
                  role="tab"
                  aria-selected={active === s.id}
                  onClick={() => focusSession(s.id)}
                >
                  <Terminal size={12} />
                  {s.title}
                </button>
                <button
                  className="end-session"
                  aria-label={`结束 ${s.title}`}
                  title="结束此终端及其中运行的进程"
                  onClick={() => close(s.id)}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="terminal-dock-actions">
          <button
            aria-label="终端快捷键"
            title="终端快捷键"
            onClick={() => setShortcutHelp((v) => !v)}
          >
            <Keyboard size={15} />
          </button>
          <select
            className="terminal-theme-select"
            aria-label="终端配色"
            title={
              session?.terminalTheme?.source === "windows-terminal"
                ? `已读取 Windows Terminal · ${session.terminalTheme.name}`
                : "未读取到本地配色，使用奶油黄；可在这里切换"
            }
            value={themeChoice}
            onChange={(e) => {
              setThemeChoice(e.target.value);
              localStorage.setItem("paperweave.terminalTheme", e.target.value);
            }}
          >
            <option value="local">
              {session?.terminalTheme?.source === "windows-terminal"
                ? `本地 · ${session.terminalTheme.name}`
                : "自动 · 奶油黄"}
            </option>
            <option value="cream">奶油黄</option>
            <option value="dark">深色</option>
          </select>
          <button
            aria-label="新建终端"
            title="新建终端"
            disabled={sessions.length >= 4}
            onClick={() => add()}
          >
            <Plus size={16} />
          </button>
          <div className="terminal-launcher" ref={launcherRef}>
            <button
              aria-label="选择终端类型"
              aria-expanded={menu}
              title="在页面中启动 Codex 或 Claude Code"
              onClick={() => setMenu((v) => !v)}
            >
              <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="terminal-launch-menu">
                {[
                  ["Shell", null],
                  ["Codex", "codex"],
                  ["Claude Code", "claude"],
                ].map(([label, cmd]) => (
                  <button
                    key={label}
                    disabled={sessions.length >= 4}
                    onClick={() => add(cmd)}
                  >
                    新建 {label} 终端
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            aria-label={split ? "取消终端分屏" : "终端分屏"}
            title={split ? "取消分屏" : "拆分终端"}
            onClick={() => {
              if (sessions.length < 2) add(null, true);
              else {
                setSplitIds([active, other]);
                setSplit((v) => !v);
                onOpenChange(true);
              }
            }}
          >
            <Columns2 size={15} />
          </button>
          <button
            aria-label={maximized ? "还原终端" : "最大化终端"}
            title={maximized ? "还原" : "最大化面板"}
            onClick={() => {
              onOpenChange(true);
              onMaximize(!maximized);
            }}
          >
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            aria-label={open ? "隐藏终端面板" : "显示终端面板"}
            title="隐藏面板不会结束会话"
            onClick={() => onOpenChange(!open)}
          >
            {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </header>
      {shortcutHelp && (
        <div className="terminal-shortcut-help">
          <strong>终端快捷键</strong>
          <button
            aria-label="关闭快捷键提示"
            onClick={() => setShortcutHelp(false)}
          >
            <X size={14} />
          </button>
          <p>Ctrl+Shift+D / Ctrl+Shift+5：分屏</p>
          <p>Ctrl+Shift+T：新建　Ctrl+Shift+W：关闭当前面板</p>
          <p>Alt+方向键：切换面板　Ctrl+PageUp / PageDown：切换会话</p>
          <p>Alt+Enter：放大 / 还原　Ctrl+V：粘贴</p>
          <small>在终端内生效；最多 4 个会话。关闭面板会结束其中的进程。</small>
        </div>
      )}
      <div className={`terminal-sessions ${split ? "split" : ""}`}>
        {sessions.map((s) => (
          <div
            key={s.id}
            className="terminal-session"
            data-session-id={s.id}
            onFocusCapture={() => setActive(s.id)}
            hidden={split ? !splitIds.includes(s.id) : s.id !== active}
          >
            <TerminalPane
              ref={(pane) => {
                if (pane) panes.current.set(s.id, pane);
                else panes.current.delete(s.id);
              }}
              initialCommand={s.command}
              autoFocus={s.id !== 1}
              theme={palette}
            />
          </div>
        ))}
        {!sessions.length && (
          <div className="terminal-no-session">
            <Terminal size={24} />
            <p>在这里运行你的 Agent 和实验命令</p>
            <button className="button primary" onClick={() => add()}>
              新建终端
            </button>
          </div>
        )}
      </div>
    </section>
  );
});
