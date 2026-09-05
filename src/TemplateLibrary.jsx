import React, { useState } from "react";
import { Search, Layers, Plus, ArrowUpRight } from "lucide-react";
import { fileUrl } from "./api";

export default function TemplateLibrary({
  templates,
  onOpen,
  onUse,
  onImport,
}) {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const items = templates.filter(
    (t) =>
      (format === "all" || t.format === format) &&
      `${t.title} ${t.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="template-library">
      <header>
        <div>
          <h2>绘图模板</h2>
          <p>选一个起点，和 Agent 一起完成你的图。</p>
        </div>
        <button className="button secondary small" onClick={onImport}>
          <Plus size={14} />
          添加模板
        </button>
      </header>
      <div className="template-filters">
        <label>
          <Search size={15} />
          <input
            aria-label="搜索绘图模板"
            placeholder="搜索模型、组件、方法…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {[
          ["all", "全部"],
          ["pptx", "PPT 模板"],
          ["svg", "矢量组件"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={format === value ? "selected" : ""}
            onClick={() => setFormat(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="template-grid">
        {items.map((t) => (
          <article className="template-card" key={t.id}>
            <button className="template-preview" onClick={() => onOpen(t)}>
              <span className="template-format">{t.format.toUpperCase()}</span>
              {t.preview ? (
                <img loading="lazy" src={fileUrl(t.preview)} alt={t.title} />
              ) : (
                <Layers size={48} />
              )}
            </button>
            <div className="template-info">
              <small>
                {t.format.toUpperCase()}
                {t.slides.length ? ` · ${t.slides.length} 页` : " · 可编辑"}
              </small>
              <h3>{t.title}</h3>
              <p>{t.tags.join(" · ")}</p>
              <button className="text-button" onClick={() => onUse(t)}>
                用这个模板绘图
                <ArrowUpRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <p className="muted padded">
          没有匹配的模板。可以把素材文件夹告诉 Agent，让它加入这里。
        </p>
      )}
    </section>
  );
}
