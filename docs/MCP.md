# MCP contract · paperweave/1

Transport: official MCP SDK stdio. The stdio process is a bridge to the running local workbench; it never writes stdout logs or modifies the state file directly. Multiple clients share one serialized writer. Read the `research-workflow` prompt before substantive research.

## Typical interaction

```json
{"name":"create_workspace","arguments":{"title":"Efficient multimodal adaptation","question":"Which methods reduce training cost without hiding inference overhead?"}}
```

```json
{"name":"upsert_paper","arguments":{"title":"Verified paper title","authors":"Verified authors","year":2025,"url":"https://example.org/paper","abstract":"Author's source abstract","summary":"Your source-grounded interpretation","method":"Inputs, modules, optimization, assumptions","findings":"Measured finding with table/page reference","limitations":"Known boundaries and untested settings","tags":["adaptation"],"status":"reading"}}
```

Replace example metadata with real verified data. Save the returned UUID. Use it in `read_paper`, `add_relation`, notes and figures.

```json
{"name":"get_context","arguments":{}}
```

Returns `context` (selected paper/page/passage/question/view), the active workspace and its papers, relations, notes, questions, figures, manuscripts and activity. Paper rows contain `pageCount`, not full PDF text; use `read_paper` for text. `get_note` and `get_manuscript` return the actual current source file and a SHA-256 `revision`.

For writing, `context.manuscriptId` and `context.manuscriptSelection` identify the chosen draft and selected source text. Use `get_manuscript` for its full latest body before editing. For an agent-downloaded PDF, call `attach_pdf` with `{paperId, path}` using an absolute local path; the source file is preserved.

```json
{"name":"save_note","arguments":{"title":"Why this objective works","kind":"concept","body":"## Question\n...\n\n## Understanding\n...\n\n## Still uncertain\n...","paperIds":["RETURNED_PAPER_UUID"],"page":4,"quote":"Actual source passage","questionId":"OPEN_QUESTION_UUID"}}
```

On note creation the server adds frontmatter and sources. On updates pass `id`, the latest `expectedRevision`, and the entire current Markdown content including frontmatter; merge rather than replacing human text. Missing / stale revision returns `isError: true`. `save_manuscript` follows the same revision rule.

`add_relation` is directed: source `uses` target means the source paper uses the target paper's method. `confidence=verified` requires a nonempty `evidence` field; the agent remains responsible for actually checking that evidence.

`draw_model` accepts nodes (`id`, `label`, `group=input|module|output`) and edges (`source`, `target`, optional `label`). The server validates unique node IDs and existing endpoints. `export_pptx` preserves previously generated PPTX files so subsequent CLI edits are not silently overwritten.

`plot_results` accepts `chartType=bar|line`, `labels`, `series=[{name,values}]`, `xLabel`, `yLabel`, and `source`. Finite numbers only; every series must match the labels. Negative values are supported. Synthetic values must be explicitly labelled; never present template values as scientific results.

Errors are returned as MCP `isError` with a concise message. Tools neither execute arbitrary shell commands nor invoke an LLM. Use the existing CLI and the explicitly opened terminal for experiments and specialist file editing.

The active workspace is shared with the dashboard. This MVP is designed for one user / research field at a time; do not switch workspaces during an in-flight multi-step agent task. Re-read context after switching.
