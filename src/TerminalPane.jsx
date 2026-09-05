import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "./api";
export default function TerminalPane() {
  const host = useRef(),
    socket = useRef(),
    [status, setStatus] = useState("连接中"),
    [epoch, setEpoch] = useState(0);
  useEffect(() => {
    setStatus("连接中");
    const term = new Terminal({
      fontFamily: "Cascadia Code, SFMono-Regular, Consolas, monospace",
      fontSize: 12,
      cursorBlink: true,
      screenReaderMode: true,
      theme: {
        background: "#202637",
        foreground: "#d8dfee",
        cursor: "#aebcec",
      },
      scrollback: 6000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
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
      setStatus("本地 Shell");
      resize();
      term.focus();
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
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
    };
  }, [epoch]);
  return (
    <div className="terminal-content">
      <div className="terminal-status">
        <i />
        <strong>{status}</strong>
        <span>运行 codex / claude，或你的实验命令</span>
        {status === "会话已结束" ? (
          <button onClick={() => setEpoch((e) => e + 1)}>重新连接</button>
        ) : (
          <button onClick={() => socket.current?.close()}>结束会话</button>
        )}
      </div>
      <div ref={host} className="terminal-host" />
    </div>
  );
}
