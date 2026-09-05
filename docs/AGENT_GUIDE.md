# Agent operations manual

This document is for installation and research agents. Keep the human-facing experience simple: the user describes intent, you perform the authorized setup and translate it into precise tool calls. Do not send the user a raw dependency checklist when you can resolve it yourself.

## Route the request

| User intent | Read first | Concrete output |
| --- | --- | --- |
| Install / connect / launch | `../INSTALL.md`, `DEPENDENCIES.md` | Working local URL, actual MCP connection, chosen vault, verified smoke test |
| A new research field | `WORKFLOW.md`, `MCP.md` | Separate workspace, verified metadata, structured paper summaries, evidence-backed map, synthesis note |
| Read / explain a paper | `WORKFLOW.md` sections 2–4 | Source-based explanation tied to the selected paper/page, saved note after discussion |
| Draw / refine a model | `WORKFLOW.md` section 5 | Inspectable source assets, SVG preview, editable native-shape PPTX where appropriate |
| Plot experiment results | `WORKFLOW.md` section 5 | Chart plus original numeric data, source path and units, linked interpretation note |
| Write / revise a paper | `WORKFLOW.md` section 6 | Revision-safe manuscript edits, verified citations, preview or compile evidence |
| Resume / troubleshoot | `DEPENDENCIES.md` recovery table, `REFERENCE.md` | Restored service and connection without recreating or discarding existing research files |

All paths above are relative to this document. If reading through GitHub, resolve relative URLs against the repository before fetching. During installation, clone the repository and use local files once available.

## Keep responsibilities explicit

- **The existing CLI agent** supplies model access, source search, PDF/image inspection, explanation, code execution and specialist PPT manipulation.
- **Paperweave** supplies the local browser UI, shared research state, MCP contract, PDF text extraction, Markdown files, figures, source data and a real terminal.
- **Obsidian** can edit the same note files. It is not a second database that the user must manually synchronize.
- **GitHub** distributes code and documentation. Do not upload the user's vault, PDFs, local runtime token, CLI configuration or experiment logs as part of setup.

## Install to completion

1. Determine the current OS, architecture, agent client, install directory and existing tool availability. Reuse the current client; do not insist that the user install both Codex and Claude Code.
2. Missing Node/Git/build tools/TeX are installation subtasks, not automatic blockers. Follow `DEPENDENCIES.md` and the host permission system. Distinguish a missing executable from a sandbox preventing detection or execution.
3. If the user has not supplied a vault, use the default local vault and tell them where it is. Do not block installation for this preference. If a vault is supplied, preserve its contents and use only its managed `Paperweave/` subdirectory.
4. Build the project and run the actual smoke test. A successful `npm ci` does not prove that the native terminal can spawn, the UI renders, or an MCP client can connect.
5. Register the absolute entry path in the intended client's configuration; merge with existing entries. Custom data directories must match between the local service and MCP subprocess.
6. Start the service persistently, verify it, then return a brief human handoff. If an interactive account login or OS privilege step is genuinely required, name that specific step and finish independent work meanwhile.

Suggested final handoff to the human:

> Paperweave is ready at [local URL]. Talk to [client] in the page terminal; notes are saved in [vault]. Describe your research question to begin. [Mention only unresolved user-action items, if any.]

Put logs, architecture, dependency details and extended validation in a file or technical report linked from that handoff.

## Conversation-first startup and terminal appearance

- `npm start` builds if `dist/index.html` is missing, reuses a healthy local service or starts a hidden background service, and opens the browser. Use `-- --no-browser` during installation/SSH checks. `npm run serve` stays in the foreground for process managers. After a code update, rebuild and restart the existing verified service; `npm start` intentionally does not terminate a healthy service and its running experiments.
- Configure `npm run setup -- --agent codex|claude|shell|auto` to match the user's existing client. `PAPERWEAVE_AGENT` overrides saved preference. `auto` checks PATH for Codex, then Claude; unavailable clients fall back to Shell. Set the intended client during installation instead of making the person choose every time.
- The first browser terminal starts that real CLI and supplies a fixed greeting prompt: read `get_context`, read `research-workflow`, briefly describe existing context, then ask what to research or continue. Do not start a literature search before the human answers. Paperweave does not supply credentials or bypass the CLI's login/trust prompts.
- During conversation, use the contract to save summaries, evidence, questions and notes. The UI does not infer research facts from raw terminal output. The board is shared by all terminal tabs; always re-read context before writing after a workspace change.
- The terminal dock opens by default. Users can resize, maximize, split and create up to four Shell/Codex/Claude terminals. Collapse and color changes preserve sessions. Explicit tab close, page close or disconnected WebSocket ends that shell. Use external terminal multiplexers for experiments that must survive page closure.
- Terminal appearance is independent from the warm paper UI. The server reads only color values from Windows Terminal settings, choosing `PAPERWEAVE_TERMINAL_PROFILE`, the saved `terminalProfile`, inherited `WT_PROFILE_ID`, or the default profile in that order. Profile overrides take precedence over defaults and a matching custom scheme. Purple ANSI keys map to xterm magenta keys. JSON comments/trailing commas are supported.
- `PAPERWEAVE_TERMINAL_THEME_FILE` or saved `terminalThemeFile` can point to a Windows-Terminal-format settings file on any OS. A light/dark scheme object uses saved `terminalAppearance` (`light` by default). Only whitelisted hex colors and the scheme name reach the browser; command lines, paths and other settings are never included.
- Automatic import currently supports custom Windows Terminal schemes. Unresolved built-in schemes, other terminal formats, missing or malformed files fall back to cream and are labelled accordingly. Do not claim universal theme detection. Convert the user's explicit palette to a small compatible settings file for unsupported terminals. The browser remembers local/cream/dark choice; switching colors updates xterm without restarting the shell. Host theme file edits apply on server restart.
- Prefer the person's intent over forms: new fields, papers, figures and manuscripts can all be created by MCP. Manual controls are optional editing tools. For a selected passage, have the user speak in the same embedded CLI and persist the resulting understanding as linked Markdown.

## Use shared context accurately

At the start of each task, read `get_context`. The authoritative fields are:

- `activeWorkspaceId` and the matching workspace's title/question: the current field and research intent.
- `context.view`: graph, reader, figures or writing.
- `context.paperId`, `page`, `selection`, `question`: the user's selected source and reading question.
- `context.manuscriptId`, `manuscriptSelection`: the selected draft and passage in the source editor.
- `questions`: durable unresolved / resolved questions; the context's latest question alone is not the whole backlog.
- `notes`, `manuscripts`, `figures`: metadata and IDs. Fetch actual current content with `get_note`, `get_manuscript`, or the returned local figure path; metadata does not include all file content.

The active workspace is shared across clients. Re-read context after a user changes fields. Do not perform a long sequence of stale mutations based on an earlier workspace selection. If a tool says an object is outside the active workspace, inspect the workspace state and switch deliberately; do not create duplicates to bypass that error.

## Scenario recipes

### New field review

1. `create_workspace` with a concrete question and scope.
2. Search primary sources using the CLI's tools; verify metadata before `upsert_paper`.
3. Download PDFs, then `attach_pdf` with local absolute paths. Use `read_paper` for bounded page retrieval and visual inspection tools for figures.
4. Update abstract, synthesis, method, findings, limitations and stable topic tags. Only mark `reviewed` after the review acceptance criteria in `WORKFLOW.md` are met.
5. Add sparse, explained, directional relationships using `add_relation`. Separate verified links from hypotheses. Meaningful evidence is more valuable than many edges.
6. Save a synthesis note with development paths, disagreements, reading order and open questions. Add unresolved questions to the dashboard.
7. Tell the user what they can inspect now and which claims still need checking.

### Explain a selected passage

1. Read the selection and surrounding PDF page. Check that it belongs to the currently selected paper.
2. Explain the mechanism with appropriate notation and a concrete example. Identify which part is source-supported and which part is an intuition.
3. Answer follow-ups in the existing CLI conversation. There is no separate automatic LLM chat backend inside the dashboard.
4. When the user asks to preserve the understanding, `save_note` with the paper ID, passage, page and relevant question ID. Only resolve a question actually addressed by that note.

### Vector assets → editable PPT workflow

1. Search for the requested asset using the CLI's web tools; record its source and license / usage conditions.
2. Save the original vector file locally and import it with `import_figure`.
3. If a structured model sketch is useful, call `draw_model`. Avoid presenting a reconstruction as an exact published model.
4. `export_pptx` returns a real local file containing native shapes/text for that structured sketch. Use the user's existing CLI PowerPoint tools to rearrange shapes or combine assets.
5. Re-export a preview SVG/PNG from the refined PPTX and import it so the board shows the current result. The previous JSON-generated SVG does not track arbitrary Office edits automatically.
6. Never promise that an arbitrary downloaded SVG can be ungrouped into Office shapes. Distinguish native-shape output, embedded vector assets and raster previews.

### Experimental results → chart → manuscript

1. Read the actual result file; check columns, missing values, units, seeds and what each run measures.
2. Pass exact numeric data and a traceable `source` to `plot_results`; preserve all included measurements in its JSON.
3. Save an experiment note with the command / source file, evaluation settings, exclusions, uncertainty and a bounded interpretation.
4. Read the latest manuscript and add the supported finding with its figure / table reference. Use the returned revision and preserve the user's other edits.
5. Verify the saved file and compile if appropriate. Do not claim a figure establishes an effect that the experimental design did not test.

## Recovery without data loss

- **Stale note or manuscript revision**: fetch the current file, merge user edits, retry with the latest revision. Never bypass the conflict by creating a replacement blank file.
- **Offline workbench**: restart the existing installation using its existing data directory; do not create a new workspace directory simply because the service is offline.
- **Vault path changed**: migrate the managed directory before switching; verify file presence before subsequent writes.
- **CLI doesn't see new MCP tools**: verify configuration and restart the CLI session; the current conversation may not dynamically reload tool registrations.
- **Native terminal error**: capture the actual message, run doctor under authorized execution, and use the platform repair instructions. macOS helper permissions are repaired automatically; missing compilation tools need a normal dependency installation.
- **Compilation error**: inspect the log, fix the specific source/package issue, then recompile. This MVP supports a single-document basic pdflatex path; use the integrated terminal for complete multi-file build systems.

## Definition of a good handoff

The human sees a usable result: a connected board, a clear explanation, a saved note, an inspectable figure or an edited manuscript. The technical evidence remains available. Keep the human's final message short and say what to do next in ordinary language. Detail belongs in these agent documents and the linked validation record.
