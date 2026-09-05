import React, { useEffect, useState } from "react";
import { useDismissable } from "./useWorkbenchInteraction";
import {
  Network,
  BookOpen,
  Image,
  PenLine,
  FileText,
  Plus,
  X,
} from "lucide-react";

export const researchViews = [
  ["graph", Network, "脉络画布"],
  ["reader", BookOpen, "论文精读"],
  ["figures", Image, "科研图件"],
  ["writing", PenLine, "论文写作"],
  ["notes", FileText, "研究笔记"],
];

export default function WorkspaceTabs({
  view,
  onView,
  workspaceId,
  paperTitle,
  children,
}) {
  const storageKey = `paperweave.tabs.${workspaceId}`;
  const [opened, setOpened] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (Array.isArray(saved))
        return [
          ...new Set([
            "graph",
            ...saved.filter((v) => researchViews.some(([key]) => key === v)),
          ]),
        ];
    } catch {}
    return ["graph", "writing"];
  });
  const [menu, setMenu] = useState(false);
  const menuRef = useDismissable(menu, () => setMenu(false));
  useEffect(() => {
    setOpened((tabs) => (tabs.includes(view) ? tabs : [...tabs, view]));
  }, [view]);
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(opened));
  }, [opened, storageKey]);
  const close = (key) => {
    const remaining = opened.filter((v) => v !== key);
    setOpened(remaining);
    if (view === key)
      onView(remaining[Math.max(0, opened.indexOf(key) - 1)] || "graph");
  };
  return (
    <nav className="workspace-tabs" aria-label="研究标签页">
      <div
        className="workspace-tab-list"
        role="tablist"
        aria-label="打开的研究页面"
      >
        {opened.map((key) => {
          const [, Icon, label] = researchViews.find(([v]) => v === key);
          const title = key === "reader" && paperTitle ? paperTitle : label;
          return (
            <div
              className={`workspace-tab ${view === key ? "active" : ""}`}
              key={key}
            >
              <button
                role="tab"
                id={`view-tab-${key}`}
                aria-selected={view === key}
                aria-controls="research-panel"
                aria-label={label}
                title={title}
                onClick={() => onView(key)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    const next =
                      opened[
                        (opened.indexOf(key) +
                          (e.key === "ArrowRight" ? 1 : opened.length - 1)) %
                          opened.length
                      ];
                    onView(next);
                    document.getElementById(`view-tab-${next}`)?.focus();
                  }
                }}
              >
                <Icon size={15} />
                <span>{title}</span>
              </button>
              {key !== "graph" && (
                <button
                  className="close-workspace-tab"
                  aria-label={`关闭${label}标签页`}
                  onClick={() => close(key)}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="new-workspace-tab" ref={menuRef}>
        <button
          aria-label="新建研究标签页"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
          title="打开研究页面"
        >
          <Plus size={17} />
        </button>
        {menu && (
          <div className="workspace-tab-menu">
            {researchViews.map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => {
                  onView(key);
                  setMenu(false);
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {children}
    </nav>
  );
}
