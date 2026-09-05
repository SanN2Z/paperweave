import React, { useEffect, useState } from "react";
import {
  Activity,
  Pin,
  Minus,
  ExternalLink,
  X,
  ChevronDown,
  ChevronUp,
  FolderOpen,
} from "lucide-react";
import { call, session } from "./api";
import "./monitor.css";

export const desktop = () => !!window.__PAPERWEAVE_DESKTOP__;
export const native = (command, args) =>
  window.__TAURI__.core.invoke(command, args);
const labels = {
  needs_approval: "等待你处理",
  needs_attention: "建议查看",
  idle_done: "本轮结束",
  working: "工作中",
  unknown: "状态未知",
  stale: "旧记录",
};
const availability = {
  missing: "未检测到 Claude 会话状态源",
  unavailable: "暂时无法读取 Claude 状态",
  partial: "部分状态文件暂不可读，正在重试",
};

export default function Monitor({ standalone = false }) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const [currentProject, setCurrentProject] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [pinned, setPinned] = useState(true),
    [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    let disposed = false,
      timer;
    const refresh = async () => {
      try {
        if (standalone) await session();
        const next = await call("get_monitor", { currentProject });
        if (!disposed) {
          setData(next);
          setError("");
        }
      } catch {
        if (!disposed)
          setError(
            "监控连接暂时不可用，正在重试。若服务刚更新，请重新启动对应服务。",
          );
      }
      if (!disposed) timer = setTimeout(refresh, 2000);
    };
    refresh();
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [currentProject, standalone]);
  const action = async (command, args, next) => {
    try {
      await native(command, args);
      next?.();
    } catch {
      setError("窗口操作未完成，请重试。");
    }
  };
  const sessions = data?.sessions || [];
  const waiting = sessions.filter((s) => s.state === "needs_approval").length;
  const visible = expanded
    ? sessions
    : sessions.filter((s, i) => i < 5 || s.state === "needs_approval");
  const provider = data?.providers.find((p) => p.id === "claude");
  return (
    <section
      className={`session-monitor ${standalone ? "standalone" : ""} ${collapsed ? "collapsed" : ""}`}
      aria-label="会话监控"
    >
      <header className="monitor-header">
        <Activity size={17} />
        <strong>会话监控</strong>
        <span className={waiting ? "monitor-attention" : "monitor-count"}>
          {error
            ? "离线"
            : waiting
              ? `${waiting} 待处理`
              : data
                ? `${sessions.length} 个会话`
                : "连接中"}
        </span>
        {standalone && desktop() && (
          <div className="monitor-window-actions">
            <button
              aria-label={pinned ? "取消置顶" : "置顶浮窗"}
              title={pinned ? "取消置顶" : "置顶浮窗"}
              aria-pressed={pinned}
              onClick={() =>
                action("pin_monitor", { pinned: !pinned }, () =>
                  setPinned(!pinned),
                )
              }
            >
              <Pin size={14} />
            </button>
            <button
              aria-label={collapsed ? "展开监控" : "折叠监控"}
              title={collapsed ? "展开监控" : "折叠监控"}
              onClick={() =>
                action("collapse_monitor", { collapsed: !collapsed }, () =>
                  setCollapsed(!collapsed),
                )
              }
            >
              {collapsed ? <ChevronDown size={15} /> : <Minus size={15} />}
            </button>
            <button
              aria-label="收起监控浮窗"
              title="收起监控浮窗"
              onClick={() => action("hide_window")}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </header>
      {!collapsed && (
        <>
          <div className="monitor-filter">
            <label>
              <input
                type="checkbox"
                checked={currentProject}
                disabled={!data?.project}
                onChange={(e) => setCurrentProject(e.target.checked)}
              />
              仅当前项目
            </label>
            <span>每 2 秒更新</span>
          </div>
          {error && (
            <p className="monitor-message" role="alert">
              {error} 下方保留的是上次观测。
            </p>
          )}
          {provider && availability[provider.availability] && (
            <p className="monitor-message">
              {availability[provider.availability]}
            </p>
          )}
          <div className="monitor-sessions">
            {!error &&
              data &&
              !sessions.length &&
              provider?.availability === "available" && (
                <p className="monitor-empty">
                  当前范围内没有已登记的 Claude 会话。
                </p>
              )}
            {visible.map((s) => (
              <button
                key={s.id}
                className={`monitor-session ${s.state}`}
                aria-expanded={selected === s.id}
                onClick={() => setSelected(selected === s.id ? null : s.id)}
              >
                <div className="monitor-row-title">
                  <i />
                  <strong>{s.name}</strong>
                  <span>{labels[s.state]}</span>
                </div>
                <p>{s.reason}</p>
                <small>
                  {s.evidence === "transcript-estimate"
                    ? "记录推测"
                    : "会话登记"}
                  {s.stale ? " · 状态可能已过期" : ""}
                </small>
                {selected === s.id && (
                  <div className="monitor-session-detail">
                    <span>{s.project || "项目路径未提供"}</span>
                    <span>
                      {s.updatedAt
                        ? `更新于 ${new Date(s.updatedAt).toLocaleTimeString()}`
                        : "更新时间未知"}
                    </span>
                    <span>请在对应的 CLI 会话中处理。监控不会代替你授权。</span>
                  </div>
                )}
              </button>
            ))}
          </div>
          {sessions.length > 5 && (
            <button
              className="monitor-expand"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{" "}
              {expanded ? "收起旧会话" : `查看全部 ${sessions.length} 个会话`}
            </button>
          )}
          <footer className="monitor-footer">
            <span>
              Claude · 本地只读
              <br />
              Codex 实时状态暂未接入
            </span>
            {desktop() && (
              <button
                className="text-button"
                onClick={() =>
                  action(standalone ? "show_workbench" : "open_monitor")
                }
              >
                <ExternalLink size={13} />
                {standalone ? "工作台" : "独立浮窗"}
              </button>
            )}
          </footer>
        </>
      )}
    </section>
  );
}

export function DesktopControls({ onMonitor }) {
  return (
    <>
      {desktop() && (
        <button
          className="button secondary small"
          title="打开已有研究目录"
          aria-label="打开研究目录"
          onClick={() => native("open_project").catch((e) => alert(String(e)))}
        >
          <FolderOpen size={15} />
        </button>
      )}
      <button
        className="button secondary small"
        title="会话监控"
        aria-label="会话监控"
        onClick={onMonitor}
      >
        <Activity size={15} />
      </button>
    </>
  );
}
