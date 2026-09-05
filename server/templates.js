import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";

export async function inspectTemplate(file) {
  if (!path.isAbsolute(file)) throw new Error("Use an absolute template path");
  const ext = path.extname(file).toLowerCase();
  if (![".svg", ".pptx"].includes(ext))
    throw new Error("Templates support SVG and editable PPTX");
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 80 * 1024 * 1024)
    throw new Error("Template must be a file smaller than 80 MB");
  const bytes = await fs.readFile(file);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (ext === ".svg") {
    if (!/<svg\b/i.test(bytes.toString("utf8")))
      throw new Error("Invalid SVG template");
    return { bytes, hash, ext, slides: [], editable: "SVG 矢量组件" };
  }
  const zip = await JSZip.loadAsync(bytes);
  if (!zip.file("ppt/presentation.xml"))
    throw new Error("Invalid PowerPoint template");
  const entries = Object.values(zip.files).filter((x) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(x.name),
  );
  if (entries.length > 500) throw new Error("Limit a template to 500 slides");
  const slides = [];
  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  )) {
    if (entry._data?.uncompressedSize > 8 * 1024 * 1024)
      throw new Error("Slide XML exceeds 8 MB");
    const xml = await entry.async("string");
    const text = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)]
      .map((m) =>
        m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
      )
      .join(" ")
      .slice(0, 1200);
    slides.push({
      number: Number(entry.name.match(/slide(\d+)/)[1]),
      shapes: (xml.match(/<p:sp[\s>]/g) || []).length,
      connectors: (xml.match(/<p:cxnSp[\s>]/g) || []).length,
      pictures: (xml.match(/<p:pic[\s>]/g) || []).length,
      text,
    });
  }
  const thumbnail = zip.file(/^docProps\/thumbnail\.(jpeg|jpg|png)$/i)[0];
  const preview =
    thumbnail &&
    (!thumbnail._data?.uncompressedSize ||
      thumbnail._data.uncompressedSize < 10 * 1024 * 1024)
      ? {
          ext: path.extname(thumbnail.name),
          bytes: await thumbnail.async("nodebuffer"),
        }
      : null;
  return {
    bytes,
    hash,
    ext,
    slides,
    preview,
    editable: "PPTX 原生对象（含图片时图片仍为位图）",
  };
}

export async function importTemplate(store, args) {
  const inspected = await inspectTemplate(args.path);
  const existing = store.state.templates.find((x) => x.hash === inspected.hash);
  if (existing) {
    if (args.file)
      Object.assign(existing, {
        title: args.title,
        tags: args.tags,
        source: args.source,
        license: args.license,
        bundled: true,
      });
    return existing;
  }
  const id = randomUUID();
  const filename = `${id}${inspected.ext}`;
  const directory = path.join(store.config.dataDir, "files");
  let preview = inspected.preview;
  if (args.previewPath) {
    const ext = path.extname(args.previewPath).toLowerCase();
    if (
      !path.isAbsolute(args.previewPath) ||
      ![".png", ".jpg", ".jpeg"].includes(ext)
    )
      throw new Error("Use an absolute PNG/JPEG preview path");
    const stat = await fs.stat(args.previewPath);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024)
      throw new Error("Preview exceeds 10 MB");
    preview = { ext, bytes: await fs.readFile(args.previewPath) };
  }
  const previewFilename = preview
    ? `${randomUUID()}${preview.ext}`
    : inspected.ext === ".svg"
      ? filename
      : null;
  await fs.writeFile(path.join(directory, filename), inspected.bytes);
  if (preview)
    await fs.writeFile(path.join(directory, previewFilename), preview.bytes);
  const { path: originalPath, previewPath, ...metadata } = args;
  const row = {
    id,
    ...metadata,
    filename,
    preview: previewFilename,
    hash: inspected.hash,
    format: inspected.ext.slice(1),
    slides: inspected.slides,
    editable: inspected.editable,
    bundled: !!args.file,
    createdAt: new Date().toISOString(),
  };
  store.state.templates.push(row);
  return row;
}

export async function useTemplate(store, args) {
  const template = store.state.templates.find((x) => x.id === args.templateId);
  if (!template) throw new Error("Unknown template");
  args.paperIds.forEach((id) => store.require("papers", id));
  const id = randomUUID(),
    filename = `${id}.${template.format}`;
  const file = path.join(store.config.dataDir, "files", filename);
  await fs.copyFile(
    path.join(store.config.dataDir, "files", template.filename),
    file,
  );
  const row = {
    id,
    workspaceId: store.state.activeWorkspaceId,
    title: args.title || `${template.title} · 工作副本`,
    kind: "template",
    filename,
    preview: template.format === "svg" ? filename : template.preview,
    templateId: template.id,
    source: template.source,
    license: template.license,
    paperIds: args.paperIds,
    caption: "从模板创建的可编辑工作副本",
    createdAt: new Date().toISOString(),
  };
  store.state.figures.push(row);
  store.state.contexts[store.state.activeWorkspaceId].figureId = id;
  return {
    ...row,
    path: file,
    editable: template.editable,
    instructions:
      "Edit this working copy with the CLI; preserve the original template. SVG is vector source. For PPTX inspect individual slide shapes and embedded pictures; do not flatten the slide into a bitmap.",
  };
}
