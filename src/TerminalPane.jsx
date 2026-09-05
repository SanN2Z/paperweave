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
import { request, wsUrl } from "./api";
export default forwardRef(function TerminalPane(
  { initialCommand = null, autoFocus = false, theme },
  ref,
) {
  const terminalRef = useRef();
  const pasteQueue = useRef(Promise.resolve());
  const [pastingImage, setPastingImage] = useState(false);
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
    setPastingImage(false);
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
  function pasteImages(files) {
    const term = terminalRef.current;
    const ws = socket.current;
    if (!term || ws?.readyState !== WebSocket.OPEN) {
      setClipboardError("终端尚未连接，请连接后重试。");
      return;
    }
    // Serialize successive pastes; deliver only to the original live pane.
    pasteQueue.current = pasteQueue.current.then(async () => {
      if (terminalRef.current !== term || ws.readyState !== WebSocket.OPEN)
        return;
      setPastingImage(true);
      setClipboardError("");
      try {
        for (const file of files) {
          if (file.size > 20 * 1024 * 1024)
            throw new Error("图片过大，请使用不超过 20 MB 的图片。");
          const attachment = await request("/api/terminal/attachments", {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: file,
          });
          if (terminalRef.current !== term || ws.readyState !== WebSocket.OPEN)
            return;
          term.paste(attachment.pasteText);
        }
      } catch (error) {
        if (terminalRef.current === term)
          setClipboardError(`图片粘贴失败：${error.message}`);
      } finally {
        if (terminalRef.current === term) {
          setPastingImage(false);
          // Upload completion must not steal focus from another pane/document.
          if (
            host.current
              ?.closest(".terminal-content")
              ?.contains(document.activeElement)
          )
            term.focus();
        }
      }
    });
  }
  function onPaste(event) {
    setClipboardError("");
    const files = [...(event.clipboardData?.files || [])].filter((file) =>
      file.type.startsWith("image/"),
    );
    if (!files.length) return; // Keep native xterm text/bracketed paste intact.
    event.preventDefault();
    event.stopPropagation();
    pasteImages(files);
  }
  async function pasteClipboard() {
    const term = terminalRef.current;
    if (!term || socket.current?.readyState !== WebSocket.OPEN) {
      setClipboardError("终端尚未连接，请连接后重试。");
      return;
    }
    try {
      if (navigator.clipboard.read) {
        try {
          const items = await navigator.clipboard.read();
          const images = [];
          for (const item of items) {
            const type = item.types.find((type) => type.startsWith("image/"));
            if (type) images.push(await item.getType(type));
          }
          if (terminalRef.current !== term) return;
          if (images.length) {
            term.focus();
            pasteImages(images);
            return;
          }
        } catch {
          // Some hosts grant text access but do not implement rich clipboard.
          // Native Ctrl/Cmd+V still supplies image files without this API.
        }
      }
      const text = await navigator.clipboard.readText();
      if (terminalRef.current !== term) return;
      if (!text) {
        setClipboardError(
          "未读到剪贴板内容。图片请点击终端后按 Ctrl+V（Mac 用 ⌘V）。",
        );
        term.focus();
        return;
      }
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
          title="粘贴文字或图片（Ctrl+V / Ctrl+Shift+V / ⌘V）"
        >
          {pastingImage ? "正在粘贴图片…" : "粘贴"}
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
      <div ref={host} className="terminal-host" onPasteCapture={onPaste} />
    </div>
  );
});
