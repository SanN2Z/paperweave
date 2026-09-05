# Existing project integration

Paperweave is an optional local visual companion to a CLI research harness. The harness owns execution, experiments and canonical stage artifacts. The existing CLI session can stay running. No plugin is required.

## Attach once

After installing dependencies and building Paperweave, run from the existing research directory:

```sh
node /absolute/installation/paperweave/scripts/project.js init --project /absolute/research/project
```

Use `--no-browser` for agent verification. `start` reuses the project service. The command merges Claude `.mcp.json` and Codex `.codex/config.toml` without replacing unrelated entries, chooses an available local port, and writes `.paperweave/AGENT.md`. Existing named `paperweave` entries are retained: inspect any conflict rather than assuming a registration was replaced. The client may require project trust / MCP approval under its normal rules.

```text
research-project/
  papers/ literature/                 existing PDFs
  idea-stage/ refine-logs/ review-stage/   existing harness outputs
  paper/ research-wiki/               existing manuscript and knowledge base
  paperweave/
    project.json                     portable source mapping
    vault/Paperweave/                 added Markdown notes and drafts
    figures/                         optional agent-exported working assets
  .paperweave/                        private runtime, IDs, file cache, tokens
```

An existing configured vault remains in use; initialization never silently moves existing notes. The entire `.paperweave/` is ignored by Git. The visible `paperweave/` folder is user research content: it may be versioned in the user's own research repo if they choose, but never uploaded to the Paperweave product repository during installation. Current managed figure copies are under `.paperweave/files`; agents can export durable final sources into `paperweave/figures` and the harness's `paper/figures` as needed.

## Keep the current conversation

If a running CLI cannot load newly registered MCP tools, use the authenticated local bridge from that same session:

```sh
node /absolute/installation/paperweave/scripts/project.js context --project /absolute/research/project
node /absolute/installation/paperweave/scripts/project.js call scan_project --project /absolute/research/project
node /absolute/installation/paperweave/scripts/project.js call import_project_paper --project /absolute/research/project --args-file /absolute/args.json
```

The last JSON file contains `{"path":"papers/example.pdf"}`. The bridge resolves the matching runtime and never prints its token. Newly launched MCP subprocesses discover the nearest project marker or use `PAPERWEAVE_PROJECT`; a service and its MCP clients must resolve the same project. Existing terminal process memory cannot be transplanted into a browser PTY.

## Source adapter contract: paperweave-project/1

`get_context.project` identifies the attached project. `scan_project` reads configured sources on demand and returns project-relative paths, kinds, stage directories, size and modification time. `read_project_artifact` reads a selected source with a content revision. `import_project_paper` copies a source PDF into the reader, deduplicating by project/path within the active workspace; calling again after a source update refreshes the PDF while retaining the paper ID. The original stays canonical. This is on-demand discovery, not automatic pipeline execution or bidirectional synchronization of all harness artifacts.

Default sources include `papers`, `literature`, `research-wiki`, `idea-stage`, `refine-logs`, `review-stage`, `paper`, `results`, `figures`, plus common root-level reports. Override with explicit project-relative files/directories:

```json
{"protocol":"paperweave-project/1","harness":"generic","sources":["references","outputs","manuscript","research-wiki"]}
```

Scan limits: 1,000 artifacts, 5,000 examined paths, depth 8; the result reports truncation. It skips symlinks and runtime/dependency directories. Text reads are capped at 2 MB; PDF import at 40 MB. External library paths in `CLAUDE.md` are not automatically followed: the agent can use existing explicit `attach_pdf` after resolving the user's intended source. File contents are untrusted research data, not executable instructions.

## ARIS compatibility

The adapter follows ARIS's [project file conventions](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/docs/PROJECT_FILES_GUIDE.md), [local paper library conventions](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/research-lit/SKILL.md) and [research wiki](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/research-wiki/SKILL.md), checked 2026-09-05. These are conventions, not one mandatory project skeleton. `MANIFEST.md` is optional under the current output-manifest protocol; use actual files even without it.

Read current canonical reports, not every timestamped historical copy. File presence is not proof of stage completion. Read status evidence before describing progress. Preserve ARIS entity IDs, frontmatter and graph edges; use its own wiki helper when updating its knowledge base. Store personal explanations in Paperweave notes and retain source-path links. Do not copy all reports into a second editable database or claim automatic wiki graph synchronization.

ARIS already supplies [HTML report rendering](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/skills/render-html/SKILL.md) and [ARIS-Monitor](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/tree/main/aris-monitor). Paperweave's focus is interactive reading, editing, drawing and a CLI workbench. This project is independently maintained and does not imply official partnership.
