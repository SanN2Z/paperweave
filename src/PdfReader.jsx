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
  MessageSquare,
  Copy,
} from "lucide-react";
GlobalWorkerOptions.workerSrc = worker;

export default function PdfReader({
  url,
  page = 1,
  onPage,
  onSelection,
  onDiscuss,
  onReplace,
}) {
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState("");
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1.1);
  const [pageSize, setPageSize] = useState({ width: 612, height: 792 });
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(page);
  const [selection, setSelection] = useState(null);
  const [copyLabel, setCopyLabel] = useState("复制原文");
  const reader = useRef(),
    scroller = useRef(),
    scrollTimer = useRef();
  const reportedPage = useRef(page);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;
  const count = doc?.numPages || 0;

  useEffect(() => {
    setError("");
    setDetail("");
    setDoc(null);
    setLoading(true);
    setSelection(null);
    let task,
      alive = true;
    Promise.resolve()
      .then(async () => {
        if (!alive) return;
        task = getDocument({ url, isEvalSupported: false });
        const document = await task.promise;
        const first = await document.getPage(1);
        if (!alive) return;
        const viewport = first.getViewport({ scale: 1 });
        setPageSize({ width: viewport.width, height: viewport.height });
        setDoc(document);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
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
      });
    return () => {
      alive = false;
      clearTimeout(scrollTimer.current);
      task?.destroy().catch(() => {});
    };
  }, [url, retry]);

  function jumpTo(number) {
    const root = scroller.current;
    const target = root?.querySelector(`[data-page-number="${number}"]`);
    if (!target) return;
    clearTimeout(scrollTimer.current);
    root.scrollTop +=
      target.getBoundingClientRect().top -
      root.getBoundingClientRect().top -
      20;
    setCurrentPage(number);
    setSelection(null);
  }
  // Agent navigation still works; scroll acknowledgements must not snap to page tops.
  useEffect(() => {
    if (!doc) return;
    const target = Math.max(1, Math.min(page || 1, doc.numPages));
    if (reportedPage.current !== target) jumpTo(target);
    reportedPage.current = target;
  }, [page, doc]);
  useEffect(() => {
    if (doc) jumpTo(Math.max(1, Math.min(page || 1, doc.numPages)));
  }, [doc]);

  function scroll() {
    setSelection(null);
    clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      const root = scroller.current;
      if (!root) return;
      const line =
        root.getBoundingClientRect().top +
        Math.min(180, root.clientHeight * 0.25);
      const visible = [...root.querySelectorAll("[data-page-number]")].find(
        (el) => el.getBoundingClientRect().bottom > line,
      );
      if (!visible) return;
      const number = Number(visible.dataset.pageNumber);
      setCurrentPage(number);
      if (number !== reportedPage.current) {
        reportedPage.current = number;
        onPageRef.current?.(number);
      }
    }, 120);
  }
  function navigate(number) {
    jumpTo(number);
    reportedPage.current = number;
    onPageRef.current?.(number);
  }
  useEffect(() => {
    if (!selection) return;
    const outside = (event) => {
      if (!event.target.closest?.(".pdf-selection-actions")) setSelection(null);
    };
    const escape = (event) => {
      if (event.key === "Escape") setSelection(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", outside);
    };
  }, [selection]);
  function select() {
    if (!onSelection) return;
    const selected = window.getSelection();
    const text = selected?.toString().trim();
    const anchor = selected?.anchorNode?.parentElement?.closest(".pdf-page");
    if (
      !text ||
      !anchor ||
      !scroller.current.contains(anchor) ||
      !scroller.current.contains(selected.focusNode)
    )
      return;
    const number = Number(anchor.dataset.pageNumber);
    const bounds = selected.getRangeAt(0).getBoundingClientRect();
    const frame = reader.current.getBoundingClientRect();
    setCopyLabel("复制原文");
    setSelection({
      text,
      page: number,
      left: Math.max(8, Math.min(bounds.left - frame.left, frame.width - 246)),
      top: Math.max(
        48,
        Math.min(bounds.bottom - frame.top + 8, frame.height - 46),
      ),
    });
    reportedPage.current = number;
    setCurrentPage(number);
    onSelection(text, number);
  }

  return (
    <div className="pdf-reader" ref={reader}>
      <div className="pdf-toolbar">
        <div>
          <button
            aria-label="上一页"
            disabled={!count || currentPage <= 1}
            onClick={() => navigate(currentPage - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            第 {currentPage} / {count || "—"} 页
          </span>
          <button
            aria-label="下一页"
            disabled={!count || currentPage >= count}
            onClick={() => navigate(currentPage + 1)}
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
          <Quote size={13} /> 连续滚动 · 划选原文讨论
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
      <div
        className="pdf-scroll"
        ref={scroller}
        onScroll={scroll}
        onMouseUp={select}
        onKeyUp={(event) => {
          if (event.shiftKey && event.key.startsWith("Arrow")) select();
        }}
        tabIndex={0}
        aria-label="PDF 连续阅读区"
      >
        {loading && <span className="loading-badge">正在加载 PDF…</span>}
        {doc &&
          Array.from({ length: count }, (_, index) => (
            <PdfPage
              key={`${retry}-${index}`}
              doc={doc}
              number={index + 1}
              zoom={zoom}
              pageSize={pageSize}
              scroller={scroller}
            />
          ))}
      </div>
      {selection && (
        <div
          className="pdf-selection-actions"
          role="toolbar"
          aria-label="原文划选操作"
          style={{ left: selection.left, top: selection.top }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {onDiscuss && (
            <button
              onClick={() => {
                onDiscuss(selection.text, selection.page);
                setSelection(null);
              }}
            >
              <MessageSquare size={14} />让 Agent 解读
            </button>
          )}
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(selection.text);
                setCopyLabel("已复制");
              } catch {
                setCopyLabel("请按 Ctrl+C");
              }
            }}
          >
            <Copy size={14} />
            {copyLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function PdfPage({ doc, number, zoom, pageSize, scroller }) {
  const container = useRef(),
    canvas = useRef(),
    layer = useRef();
  const [nearby, setNearby] = useState(false);
  const [size, setSize] = useState(pageSize);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => setNearby(entry.isIntersecting),
      { root: scroller.current, rootMargin: "900px 0px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [scroller]);
  useEffect(() => {
    if (!nearby) return;
    let active = true,
      render,
      textLayer;
    setLoading(true);
    setError("");
    (async () => {
      const page = await doc.getPage(number);
      if (!active) return;
      const base = page.getViewport({ scale: 1 });
      setSize({ width: base.width, height: base.height });
      const viewport = page.getViewport({ scale: zoom });
      const scale = window.devicePixelRatio || 1;
      const c = canvas.current;
      c.width = Math.floor(viewport.width * scale);
      c.height = Math.floor(viewport.height * scale);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      layer.current.replaceChildren();
      layer.current.style.setProperty("--scale-factor", zoom);
      layer.current.style.setProperty("--total-scale-factor", zoom);
      render = page.render({
        canvasContext: c.getContext("2d"),
        viewport,
        transform: scale !== 1 ? [scale, 0, 0, scale, 0, 0] : null,
      });
      await render.promise;
      const text = await page.getTextContent();
      if (!active) return;
      textLayer = new TextLayer({
        textContentSource: text,
        container: layer.current,
        viewport,
      });
      await textLayer.render();
      if (active) setLoading(false);
    })().catch((e) => {
      if (active && e.name !== "RenderingCancelledException") {
        setError(pdfErrorDetail(e));
        setLoading(false);
      }
    });
    return () => {
      active = false;
      render?.cancel();
      textLayer?.cancel();
    };
  }, [doc, number, zoom, nearby, retry]);
  return (
    <div
      className="pdf-page"
      ref={container}
      data-page-number={number}
      aria-label={`PDF 第 ${number} 页`}
      style={{ width: size.width * zoom, height: size.height * zoom }}
    >
      <span className="pdf-page-label">{number}</span>
      {nearby && (
        <>
          {loading && (
            <span className="loading-badge">正在渲染第 {number} 页…</span>
          )}
          <canvas ref={canvas} />
          <div ref={layer} className="textLayer" />
          {error && (
            <div className="pdf-page-error" role="alert">
              <p>第 {number} 页暂时无法渲染。</p>
              <button onClick={() => setRetry((n) => n + 1)}>重试这一页</button>
              <details>
                <summary>错误详情</summary>
                <pre className="pdf-error-detail">{error}</pre>
              </details>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function pdfErrorDetail(error) {
  return `${error.name || "Error"}: ${error.message || "未知错误"}`
    .replace(/[?&]token=[^\s"'&#)]+/gi, "")
    .replace(/\b[a-f0-9]{64}\b/gi, "[已隐藏]")
    .slice(0, 1500);
}
