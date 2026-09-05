import React, { useEffect, useRef, useState } from "react";
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import worker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Quote,
} from "lucide-react";
GlobalWorkerOptions.workerSrc = worker;
export default function PdfReader({
  url,
  page = 1,
  onPage,
  onSelection,
  onReplace,
}) {
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState("");
  const [doc, setDoc] = useState(null),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1.1),
    [count, setCount] = useState(0),
    [loading, setLoading] = useState(true);
  const canvas = useRef(),
    layer = useRef(),
    container = useRef();
  useEffect(() => {
    setError("");
    setDetail("");
    setDoc(null);
    setCount(0);
    setLoading(true);
    let task;
    let alive = true;
    Promise.resolve()
      .then(() => {
        if (!alive) return;
        task = getDocument({ url, isEvalSupported: false });
        return task.promise;
      })
      .then((d) => {
        if (alive && d) {
          setDoc(d);
          setCount(d.numPages);
        }
      })
      .catch((e) => {
        if (alive) {
          setDetail(pdfErrorDetail(e));
          setError(
            e.status === 404
              ? "PDF 暂时无法读取，请重试或重新关联文件。"
              : e.status === 401 || e.status === 403
                ? "连接已更新，请刷新页面后重新打开论文。"
                : /worker|dynamically imported|module script/i.test(e.message)
                  ? "阅读器组件未能加载，请刷新页面后重试。"
                  : "PDF 加载失败，请重试；具体原因见下方错误详情。",
          );
          setLoading(false);
        }
      });
    return () => {
      alive = false;
      task?.destroy().catch(() => {});
    };
  }, [url, retry]);
  useEffect(() => {
    if (!doc) return;
    let active = true,
      render,
      textLayer;
    setLoading(true);
    (async () => {
      const p = await doc.getPage(Math.min(page, doc.numPages));
      if (!active) return;
      const viewport = p.getViewport({ scale: zoom });
      const scale = devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(viewport.width * scale);
      c.height = Math.floor(viewport.height * scale);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      container.current.style.width = `${viewport.width}px`;
      container.current.style.height = `${viewport.height}px`;
      layer.current.replaceChildren();
      layer.current.style.setProperty("--scale-factor", zoom);
      layer.current.style.setProperty("--total-scale-factor", zoom);
      render = p.render({
        canvasContext: c.getContext("2d"),
        viewport,
        transform: scale !== 1 ? [scale, 0, 0, scale, 0, 0] : null,
      });
      await render.promise;
      if (!active) return;
      textLayer = new TextLayer({
        textContentSource: await p.getTextContent(),
        container: layer.current,
        viewport,
      });
      await textLayer.render();
      if (active) setLoading(false);
    })().catch((e) => {
      if (active && e.name !== "RenderingCancelledException") {
        setError("这一页暂时无法渲染，请重试或更换 PDF 文件。");
        setDetail(pdfErrorDetail(e));
        setLoading(false);
      }
    });
    return () => {
      active = false;
      render?.cancel();
      textLayer?.cancel();
    };
  }, [doc, page, zoom]);
  function select() {
    const selected = window.getSelection();
    const text = selected?.toString().trim();
    if (text && layer.current?.contains(selected.anchorNode))
      onSelection?.(text, page);
  }
  return (
    <div className="pdf-reader">
      <div className="pdf-toolbar">
        <div>
          <button
            aria-label="上一页"
            disabled={page <= 1}
            onClick={() => onPage?.(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            第 {page} / {count || "—"} 页
          </span>
          <button
            aria-label="下一页"
            disabled={page >= count}
            onClick={() => onPage?.(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div>
          <button
            aria-label="缩小"
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
          >
            <ZoomOut size={16} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="放大"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
          >
            <ZoomIn size={16} />
          </button>
        </div>
        <small>
          <Quote size={13} /> 划选原文，带着上下文讨论
        </small>
      </div>
      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry((n) => n + 1)}>重试读取</button>
          <button onClick={() => window.location.reload()}>刷新页面</button>
          {onReplace && <button onClick={onReplace}>重新关联 PDF</button>}
          <details>
            <summary>错误详情</summary>
            <pre className="pdf-error-detail">{detail}</pre>
          </details>
        </div>
      )}
      <div className="pdf-scroll">
        {loading && <span className="loading-badge">正在渲染 PDF…</span>}
        <div className="pdf-page" ref={container} onMouseUp={select}>
          <canvas ref={canvas} />
          <div ref={layer} className="textLayer" />
        </div>
      </div>
    </div>
  );
}

function pdfErrorDetail(error) {
  // Keep useful renderer diagnostics without leaking a session token in copied text.
  return `${error.name || "Error"}: ${error.message || "未知错误"}`
    .replace(/[?&]token=[^\s"'&#)]+/gi, "")
    .replace(/\b[a-f0-9]{64}\b/gi, "[已隐藏]")
    .slice(0, 1500);
}
