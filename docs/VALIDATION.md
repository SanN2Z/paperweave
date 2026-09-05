# Validation record · 2026-09-05

Local environment: Windows, Node.js 24.13, installed Microsoft Edge, local MiKTeX / pdflatex. Screenshots contain clearly labelled fictional papers and synthetic data, not a completed literature review.

## Executed checks

- `npm test`: **20 passed, 0 failed**. Includes persistence, concurrency, workspace isolation, evidence/revision checks, editable PPTX, Windows Terminal profile/theme/environment behavior, bundled template deduplication and independent copies, preview refresh, existing-project setup/bridge, and ARIS/generic source discovery with PDF refresh and traversal rejection.
- Integration checks use an **actual MCP SDK stdio client**, not a mocked protocol: tool discovery, workflow prompt, resource reading, tool errors, PDF attachment / text retrieval, and WebSocket updates.
- `npm run build`: production Vite build passed. PDF viewer and terminal are lazy-loaded; all application assets are served locally.
- `npm run test:browser`: browser checks cover paper creation, live graph updates, model/result figures, native PPTX export, Markdown editing and preview, PDF rendering and selected-source context, external Obsidian note changes, real PTY output, default-open terminal, theme changes retaining output, resizing, splitting, maximizing, collapse persistence and compact desktop layout. Screenshots use 2× pixel density. Browser fixtures start Shell; no model call is required for testing.
- The latest layout checks cover closing/reopening research tabs, the notes page, a full-height canvas during horizontal terminal resizing, hidden optional drawers and a steady focused cursor. The frontend no longer renders workspace statistics or the large heading.
- The interface refresh adds passing checks for outside-click menu dismissal, Escape and focus return in both launch menus, modal initial focus and Tab wrapping, and preserved scroll position across source/visual note editing. The test exposed and fixed modal focus being captured after a child autofocus. Fresh demo screenshots verify the light neutral rail and white document surface with the cream terminal palette retained. Shared style tokens and interaction conventions are documented in [INTERFACE.md](INTERFACE.md).
- Current browser regression also checks continuous four-page PDF scrolling with page-context updates; explicit selection handoff and Escape dismissal; graph coordinates after browser reload and dragged connector endpoints; the 11 bundled template cards and vector-edit request entry; working-copy creation; a single-line, non-submitted Shell handoff; writing focus mode; direct visual edits in both notes and manuscripts; and Markdown roundtrips preserving frontmatter, Obsidian links, TeX, citations, tasks, tables and code. Source/preview revision checks remain active.
- Native local profile verification detects the user's `proxy` PowerShell function without invoking it. A Claude Code terminal rendered its orange UI with 13 distinct colors after removing inherited `NO_COLOR`; the actual local PDF exposed 27 continuous page slots. These checks inspect local UI without a model prompt, and their private screenshots are excluded from Git. This proves the tested local configuration, not every shell or Claude setup.
- PDF regression: test data directories now have a leading dot, matching production `.paperweave`. Uploaded files are downloaded and compared byte-for-byte, with authentication still required. The browser also verifies recovery from a simulated 404 without displaying a token-bearing URL. The originally failing local **5,302,200-byte** PDF returned HTTP 200 and rendered **154 selectable text spans** after the fix. Its contents and verification screenshot stay outside Git.
- Follow-up PDF check: a fresh local Edge still rendered the real paper, while the user reported a failure in their existing browser tab. That tab's underlying exception was not available, so its root cause is not yet confirmed. Switched both main library and worker to the [official PDF.js compatibility build](https://mozilla.github.io/pdf.js/getting_started/), caught synchronous initialization failures, and exposed token-scrubbed error details with retry/refresh controls. The browser regression renders and selects text with `Promise.try` and `URL.parse` disabled in the page, and verifies 404 recovery. This is a targeted compatibility check, not a claim that every older browser works.
- Clipboard regression: reproduced Ctrl+V sending `U+0016` instead of clipboard text. After the fix, real Edge clipboard tests send Chinese multiline text exactly once through Ctrl+V, Ctrl+Shift+V, Shift+Insert and the Paste button, with no stray `U+0016`. Denied clipboard reads show native-paste guidance. Clipboard contents are restored after the test. Shortcut interception and insertion use the [public xterm APIs](https://xtermjs.org/docs/api/terminal/classes/terminal/).
- `node scripts/latex-check.js`: real local pdflatex compilation passed; generated a valid **28,778-byte PDF** from a saved manuscript. This checks the basic article template, not every journal template or TeX package combination.
- `npm run doctor`: local Node, Git, Codex, Claude Code, pdflatex, PTY module, application dependencies and production build were detected.

**GitHub Actions passed on Windows, Linux and macOS**, including installation, build, all 13 automated tests and the browser workflow. Verified code commit: `2fe58c9`. [Successful three-platform run](https://github.com/shanyuzhe/paperweave/actions/runs/33943753779).

The first macOS run exposed node-pty 1.1.0's missing helper executable permission. Installation and startup now repair the specific package helper files; the subsequent macOS run passed. On local Windows, node-pty's console enumeration helper can emit an `AttachConsole failed` diagnostic during already-exited Shell cleanup; command output, session lifecycle checks and test process exit still passed. The output worker is explicitly released to avoid retaining a worker per ended session.

## Current dependency audit finding

`npm audit` reports **2 high-severity entries**: `image-size` and its parent `pptxgenjs`. The upstream advisories concern infinite loops in ICNS / JXL / HEIF image-size parsing:

- [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr)
- [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq)

At the time checked, the public registry had no fixed `image-size` version beyond the affected 2.0.2. Paperweave's exporter only uses `addShape`, `addText` and slide notes; it does **not** invoke image-size or pass imported assets to that parser. Imports are restricted to PNG/JPEG/WebP/SVG and are copied as files. This limits the reachable code path but does not mean the dependency audit is clean. Update or replace the upstream dependency before adding arbitrary-image PPTX processing. Do not use `npm audit fix --force` to downgrade PptxGenJS to an incompatible release.

## Explicitly outside the validation claim

- Full transplantation of another running shell's memory/session into the browser; universal terminal-emulator configuration support. Normal shell profiles and supported Windows Terminal palettes are loaded.
- Automatic synchronization of all ARIS artifacts or research-wiki graph edges. Project discovery/import is currently an on-demand MCP/CLI adapter.
- Guaranteed semantic compliance of an arbitrary model. Context/prompt contracts now require a substantive answer after reading context; automated browser tests do not call paid models.

- Human verification of scientific claims and citations; quality of arbitrary agents' field reviews.
- OCR, real-time interpretation of every terminal conversation, and automatic capture of PowerPoint edits.
- Manual daily use on macOS / Linux beyond the passing Actions workflows.
- Large graph performance, multi-user simultaneous editing, and multi-file journal LaTeX builds.
- Arbitrary imported SVG-to-Office-shape conversion. The exported model diagram is native editable shapes; imported SVGs remain separate vector assets.
