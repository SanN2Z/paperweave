# Validation record · 2026-09-05

Local environment: Windows, Node.js 24.13, installed Microsoft Edge, local MiKTeX / pdflatex. Screenshots contain clearly labelled fictional papers and synthetic data, not a completed literature review.

## Executed checks

- `npm test`: **16 passed, 0 failed**. Tests cover persistence, concurrent writes, workspace isolation, relationship integrity, source-preserving notes, external-edit conflict rejection, manuscript revision protection, chart validation, editable PPTX structure, preservation of external PPTX edits, Windows Terminal theme precedence, safe fallback and reuse of a running service by the daily launcher.
- Integration checks use an **actual MCP SDK stdio client**, not a mocked protocol: tool discovery, workflow prompt, resource reading, tool errors, PDF attachment / text retrieval, and WebSocket updates.
- `npm run build`: production Vite build passed. PDF viewer and terminal are lazy-loaded; all application assets are served locally.
- `npm run test:browser`: browser checks cover paper creation, live graph updates, model/result figures, native PPTX export, Markdown editing and preview, PDF rendering and selected-source context, external Obsidian note changes, real PTY output, default-open terminal, theme changes retaining output, resizing, splitting, maximizing, collapse persistence and compact desktop layout. Screenshots use 2× pixel density. Browser fixtures start Shell; no model call is required for testing.
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

- Human verification of scientific claims and citations; quality of arbitrary agents' field reviews.
- OCR, real-time interpretation of every terminal conversation, and automatic capture of PowerPoint edits.
- Manual daily use on macOS / Linux beyond the passing Actions workflows.
- Large graph performance, multi-user simultaneous editing, and multi-file journal LaTeX builds.
- Arbitrary imported SVG-to-Office-shape conversion. The exported model diagram is native editable shapes; imported SVGs remain separate vector assets.
