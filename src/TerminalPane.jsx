import React, {
  forwardRef,
  useImperativeHandle,
  useEffect,
  useRef,
  useState,
} from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "./api";
export default forwardRef(function TerminalPane(
  { initialCommand = null, autoFocus = false, theme },
  ref,
) {
  const terminalRef = useRef();
  const [clipboardError, setClipboardError] = useState("");
  const host = useRef(),
    socket = useRef(),
    [status, setStatus] = useState("连接中"),
    [epoch, setEpoch] = useState(0);
  useImperativeHandle(ref, () => ({
    send(text, submit = false) {
      const ws = socket.current;
      if (ws?.readyState !== WebSocket.OPEN || !terminalRef.current)
        return false;
      terminalRef.current.paste(text);
      terminalRef.current.focus();
      if (submit)
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ type: "input", data: "\r" }));
        }, 80);
      return true;
    },
  }));
  useEffect(() => {
    setStatus("连接中");
    const term = new Terminal({
      fontFamily: "Cascadia Code, SFMono-Regular, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.25,
      cursorBlink: false,
      cursorStyle: "bar",
      cursorWidth: 1,
      cursorInactiveStyle: "bar",
      screenReaderMode: true,
      theme,
      scrollback: 6000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    terminalRef.current = term;
    // Focus when the pane mounts. A delayed connection must not steal focus
    // after the user has already switched back to another pane or document.
    if (autoFocus) term.focus();
    term.attachCustomKeyEventHandler((event) => {
      const pasteKey =
        !event.altKey &&
        (((event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "v") ||
          (event.shiftKey && event.key === "Insert"));
      if (!pasteKey) return true;
      // Let native paste events deliver Ctrl/Cmd+V and Shift+Insert. Sending
      // Ctrl+V to the PTY instead swallows the browser paste on Windows.
      if (event.ctrlKey && event.shiftKey) {
        event.preventDefault();
        if (event.type === "keydown") void pasteClipboard();
      }
      return false;
    });
    fit.fit();
    const ws = new WebSocket(wsUrl("/terminal"));
    socket.current = ws;
    const resize = () => {
      if (!host.current?.clientHeight) return;
      fit.fit();
      if (ws.readyState === 1)
        ws.send(
          JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }),
        );
    };
    ws.onopen = () => {
      resize();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "ready") {
        setStatus(
          initialCommand?.startsWith("codex")
            ? "Codex"
            : initialCommand?.startsWith("claude")
              ? "Claude Code"
              : "本地 Shell",
        );
        resize();
        if (initialCommand)
          ws.send(
            JSON.stringify({ type: "input", data: `${initialCommand}\r` }),
          );
      }
      if (m.type === "data") term.write(m.data);
      if (m.type === "error") term.writeln(`\r\n${m.message}`);
    };
    ws.onclose = () => {
      setStatus("会话已结束");
      term.writeln("\r\n[连接已关闭，点击重新连接创建新会话]");
    };
    const input = term.onData((data) => {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: "input", data }));
    });
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    return () => {
      observer.disconnect();
      input.dispose();
      ws.onclose = null;
      ws.close();
      term.dispose();
      terminalRef.current = null;
    };
  }, [epoch]);
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.options.theme = theme;
  }, [theme]);
  async function pasteClipboard() {
    const term = terminalRef.current;
    if (!term || socket.current?.readyState !== WebSocket.OPEN) {
      setClipboardError("终端尚未连接，请连接后重试。");
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (terminalRef.current !== term) return;
      term.paste(text);
      term.focus();
      setClipboardError("");
    } catch {
      setClipboardError(
        "浏览器未允许读取剪贴板。请点击终端后按 Ctrl+V（Mac 用 ⌘V），或右键选择粘贴。",
      );
      term.focus();
    }
  }
  return (
    <div className="terminal-content">
      <div className="terminal-status">
        <i />
        <strong>{status}</strong>
        <span>运行 codex / claude，或你的实验命令</span>
        <button
          onClick={pasteClipboard}
          title="粘贴剪贴板文字（Ctrl+V / Ctrl+Shift+V / ⌘V）"
        >
          粘贴
        </button>
        {status === "会话已结束" ? (
          <button onClick={() => setEpoch((e) => e + 1)}>重新连接</button>
        ) : (
          <button onClick={() => socket.current?.close()}>结束会话</button>
        )}
      </div>
      {clipboardError && (
        <div className="terminal-clipboard-error" role="status">
          {clipboardError}
        </div>
      )}
      <div
        ref={host}
        className="terminal-host"
        onPasteCapture={() => setClipboardError("")}
      />
    </div>
  );
});
