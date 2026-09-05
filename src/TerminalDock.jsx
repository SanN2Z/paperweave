import React, { useRef, useState } from "react";
import {
  Terminal,
  Plus,
  Columns2,
  ChevronDown,
  ChevronUp,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";
import TerminalPane from "./TerminalPane";
import { creamTheme, darkTheme } from "../shared/terminal-themes";

export default function TerminalDock({
  open,
  onOpenChange,
  maximized,
  onMaximize,
  session,
}) {
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
  const [height, setHeight] = useState(() => {
    const saved = Number(localStorage.getItem("paperweave.terminalHeight"));
    return saved >= 160 && saved <= 600 ? saved : 285;
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
      Math.max(160, v),
      Math.max(160, (dock.current?.parentElement.clientHeight || 700) - 130),
    );
  const resize = (value) => {
    const h = clamp(value);
    setHeight(h);
    localStorage.setItem("paperweave.terminalHeight", String(h));
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
    setSplit(shouldSplit);
    setMenu(false);
    onOpenChange(true);
  };
  const close = (id) => {
    const remaining = sessions.filter((s) => s.id !== id);
    setSessions(remaining);
    if (active === id) setActive(remaining.at(-1)?.id);
    if (remaining.length < 2) setSplit(false);
  };
  const other = sessions.find((s) => s.id !== active)?.id;
  return (
    <section
      ref={dock}
      className={`terminal-dock ${open ? "is-open" : "is-hidden"} ${maximized ? "is-maximized" : ""}`}
      style={{
        "--terminal-height": `${height}px`,
        "--terminal-bg": palette.background,
        "--terminal-fg": palette.foreground,
      }}
      aria-label="集成终端"
    >
      {open && !maximized && (
        <div
          className="terminal-resizer"
          role="separator"
          aria-label="调整终端高度"
          aria-orientation="horizontal"
          aria-valuemin={160}
          aria-valuemax={Math.round(
            Math.max(
              160,
              (dock.current?.parentElement.clientHeight || 700) - 130,
            ),
          )}
          aria-valuenow={Math.round(height)}
          tabIndex={0}
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, height };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current)
              resize(drag.current.height + drag.current.y - e.clientY);
          }}
          onPointerUp={(e) => {
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onKeyDown={(e) => {
            if (["ArrowUp", "ArrowDown"].includes(e.key)) {
              e.preventDefault();
              resize(height + (e.key === "ArrowUp" ? 20 : -20));
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
                  onClick={() => setActive(s.id)}
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
          <div className="terminal-launcher">
            <button
              aria-label="选择终端类型"
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
      <div className={`terminal-sessions ${split ? "split" : ""}`}>
        {sessions.map((s) => (
          <div
            key={s.id}
            className="terminal-session"
            hidden={s.id !== active && !(split && s.id === other)}
          >
            <TerminalPane
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
}
