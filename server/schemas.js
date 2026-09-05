import { z } from "zod";
const id = z.string().uuid();
const short = z.string().trim().min(1).max(500);
const text = z.string().max(100000);
const url = z
  .string()
  .url()
  .refine(
    (v) => ["http:", "https:"].includes(new URL(v).protocol),
    "Use an HTTP(S) URL",
  );
export const tools = {
  attach_pdf: {
    description:
      "Import a downloaded local PDF into a paper and extract page-indexed text. Use an absolute path; the source file is copied, never moved. Maximum 40 MB, no OCR.",
    schema: z.object({ paperId: id, path: short }),
  },
  get_manuscript: {
    description:
      "Read a manuscript source file and revision, including changes by the user or CLI.",
    schema: z.object({ manuscriptId: id }),
  },
  save_manuscript: {
    description:
      "Create or update a Markdown/LaTeX manuscript. Updates require expectedRevision from get_manuscript. Use sourced claims and mark unresolved citations.",
    schema: z.object({
      id: id.optional(),
      expectedRevision: z.string().optional(),
      title: short,
      format: z.enum(["tex", "md"]),
      body: text,
    }),
  },
  export_pptx: {
    description:
      "Export a model figure as editable native PowerPoint shapes and text; preserve source JSON and SVG. Returns the local PPTX path for further CLI editing.",
    schema: z.object({ figureId: id }),
  },
  create_workspace: {
    description:
      "Start a separate research field with a title and research question. Activates the new workspace.",
    schema: z.object({
      title: short,
      question: z.string().max(4000).default(""),
    }),
  },
  switch_workspace: {
    description:
      "Switch the dashboard and subsequent tools to an existing research workspace.",
    schema: z.object({ workspaceId: id }),
  },
  get_context: {
    description:
      "Read the live dashboard context: selected paper, PDF page and selected passage, question, notes and graph. Call before answering reading questions.",
    schema: z.object({}),
  },
  list_papers: {
    description: "List papers and research relationships in this workbench.",
    schema: z.object({}),
  },
  upsert_paper: {
    description:
      "Add a paper or update its metadata and structured reading summary. Preserve source URLs; never invent paper metadata. Omit id to create. Abstract is author text; summary is agent synthesis.",
    schema: z.object({
      id: id.optional(),
      title: short,
      authors: z.string().max(2000).optional(),
      year: z.number().int().min(1800).max(2200).optional(),
      url: url.optional(),
      tags: z.array(short).max(30).optional(),
      status: z.enum(["unread", "reading", "reviewed"]).optional(),
      abstract: text.optional(),
      summary: text.optional(),
      method: text.optional(),
      findings: text.optional(),
      limitations: text.optional(),
    }),
  },
  read_paper: {
    description:
      "Read a paper and its extracted PDF text, optionally one page. Extraction does not provide OCR for scanned pages.",
    schema: z.object({
      paperId: id,
      page: z.number().int().positive().optional(),
    }),
  },
  add_relation: {
    description:
      "Connect two papers with a directed research relationship and a source-grounded explanation. Distinguish verified evidence from hypothesis.",
    schema: z.object({
      source: id,
      target: id,
      kind: z.enum(["extends", "supports", "contradicts", "uses", "compares"]),
      explanation: short,
      evidence: z.string().max(4000),
      page: z.number().int().positive().optional(),
      confidence: z.enum(["verified", "hypothesis"]).default("hypothesis"),
    }),
  },
  save_note: {
    description:
      "Save an Obsidian-compatible Markdown note about a paper, a concept, a discussion or an experiment. Include source passage/page where available. Updates require the revision from get_note to protect user edits.",
    schema: z.object({
      id: id.optional(),
      expectedRevision: z.string().optional(),
      title: short,
      body: text,
      kind: z
        .enum(["reading", "concept", "discussion", "experiment"])
        .default("reading"),
      paperIds: z.array(id).max(50).default([]),
      page: z.number().int().positive().optional(),
      quote: z.string().max(10000).optional(),
      questionId: id.optional(),
    }),
  },
  get_note: {
    description:
      "Read the actual Markdown file from the vault, including edits made in Obsidian, with a revision for conflict-safe updates.",
    schema: z.object({ noteId: id }),
  },
  set_context: {
    description:
      "Set dashboard focus or record the current user question. Do not change focus unless requested.",
    schema: z.object({
      paperId: id.nullable().optional(),
      manuscriptId: id.nullable().optional(),
      manuscriptSelection: z.string().max(10000).optional(),
      page: z.number().int().positive().optional(),
      selection: z.string().max(10000).optional(),
      question: z.string().max(10000).optional(),
      view: z.enum(["graph", "reader", "figures", "writing"]).optional(),
    }),
  },
  add_question: {
    description:
      "Record an unresolved question linked to the selected paper and source passage. Saving a note with questionId resolves it.",
    schema: z.object({
      paperId: id.nullable().default(null),
      question: short,
      quote: z.string().max(10000).default(""),
      page: z.number().int().positive().optional(),
    }),
  },
  log_activity: {
    description:
      "Publish a concise research progress update visible on the dashboard. Avoid raw chain-of-thought; log findings, source checks, gaps or experiment results.",
    schema: z.object({ message: short }),
  },
  draw_model: {
    description:
      "Render a model architecture from explicit nodes and directed edges. Preserve the supplied structure as editable JSON and SVG. Label it as a reconstruction if inferred.",
    schema: z.object({
      title: short,
      paperIds: z.array(id).default([]),
      caption: z.string().max(4000).default(""),
      nodes: z
        .array(
          z.object({
            id: short,
            label: short,
            group: z.enum(["input", "module", "output"]).default("module"),
          }),
        )
        .min(1)
        .max(30),
      edges: z
        .array(
          z.object({
            source: short,
            target: short,
            label: z.string().max(100).default(""),
          }),
        )
        .max(80),
    }),
  },
  plot_results: {
    description:
      "Render a reproducible bar or line chart from supplied numeric data; never invent measurements. Source and units are required. JSON data and SVG remain available.",
    schema: z.object({
      title: short,
      paperIds: z.array(id).default([]),
      caption: z.string().max(4000).default(""),
      source: short,
      xLabel: short,
      yLabel: short,
      chartType: z.enum(["bar", "line"]),
      labels: z.array(short).min(1).max(40),
      series: z
        .array(
          z.object({
            name: short,
            values: z.array(z.number().finite()).min(1).max(40),
          }),
        )
        .min(1)
        .max(8),
    }),
  },
  import_figure: {
    description:
      "Copy an existing local PNG/JPEG/WebP/SVG figure into the workspace. Supply an absolute local path, source attribution and paper references. Does not fetch remote URLs.",
    schema: z.object({
      title: short,
      path: short,
      paperIds: z.array(id).default([]),
      caption: z.string().max(4000).default(""),
      source: short,
    }),
  },
};
