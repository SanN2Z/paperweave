import React, { useEffect, useState } from "react";
import { Minus, Square, Copy, X } from "lucide-react";
import owl from "../assets/brand/paper-owl.png";
import "./desktop-frame.css";

// The host explicitly enables this only for windows whose OS title bar is removed.
// Ordinary browser tabs and macOS keep their existing native window controls.
export default function DesktopFrame({ children }) {
  const custom = !!window.__PAPERWEAVE_CUSTOM_CHROME__;
  const [maximized, setMaximized] = useState(false);
  const [focused, setFocused] = useState(document.hasFocus());
  const [error, setError] = useState("");
  const action = async (action) => {
    try {
      const state = await window.__TAURI__.core.invoke("window_action", { action });
      setMaximized(state);
      setError("");
    } catch {
      setError("窗口操作未完成，请重试。");
    }
  };
  useEffect(() => {
    if (!custom) return;
    const sync = () => action("state");
    const focus = () => { setFocused(true); sync(); };
    const blur = () => setFocused(false);
    action("ready");
    window.addEventListener("resize", sync);
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blur);
    };
  }, [custom]);
  if (!custom) return children;
  return (
    <div className={`desktop-frame ${focused ? "is-focused" : ""} ${maximized ? "is-maximized" : ""}`}>
      <header className="desktop-titlebar" aria-label="应用窗口">
        <div className="desktop-drag-area" onMouseDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          action(e.detail === 2 ? "toggle_maximize" : "drag");
        }}>
          <img src={owl} alt="" draggable="false" width="22" height="22" />
          <span>Paperweave</span>
          <span className="desktop-titlebar-detail">研究工作台</span>
        </div>
        <div className="desktop-window-buttons">
          <button aria-label="最小化窗口" title="最小化" onClick={() => action("minimize")}><Minus /></button>
          <button aria-label={maximized ? "还原窗口" : "最大化窗口"} title={maximized ? "还原" : "最大化"} onClick={() => action("toggle_maximize")}>
            {maximized ? <Copy /> : <Square />}
          </button>
          <button className="desktop-close" aria-label="收起窗口到托盘" title="收起到托盘 · 终端继续运行" onClick={() => action("hide")}><X /></button>
        </div>
      </header>
      {error && <div className="desktop-window-error" role="alert">{error}<button aria-label="关闭窗口提示" onClick={() => setError("")}><X size={14} /></button></div>}
      {children}
    </div>
  );
}
