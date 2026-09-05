import { useCallback, useEffect, useRef } from "react";

export function useDismissable(open, onClose) {
  const root = useRef(null),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const outside = (e) => {
      if (!root.current?.contains(e.target)) close.current();
    };
    const escape = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
      root.current?.querySelector("button[aria-expanded]")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return root;
}

export function useDocumentScroll(documentId, mode) {
  const positions = useRef(new Map()),
    fraction = useRef(new Map());
  const key = `${documentId}:${mode}`;
  const onScroll = useCallback(
    (e) => {
      const node = e.currentTarget;
      positions.current.set(key, node.scrollTop);
      fraction.current.set(
        documentId,
        node.scrollTop / Math.max(1, node.scrollHeight - node.clientHeight),
      );
    },
    [key, documentId],
  );
  const ref = useCallback(
    (node) => {
      if (!node) return;
      requestAnimationFrame(() => {
        if (node.isConnected)
          node.scrollTop =
            positions.current.get(key) ??
            (fraction.current.get(documentId) || 0) *
              (node.scrollHeight - node.clientHeight);
      });
    },
    [key, documentId],
  );
  return { ref, onScroll };
}
