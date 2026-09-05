# Desktop distribution direction

Status: proposed product architecture, checked against the current code and upstream sources on 2026-09-05. Paperweave currently ships as source with a local browser workbench. A desktop installer, tray and native monitor window are not implemented yet.

## Product shape

Publish Paperweave as a lightweight desktop research workbench with an MCP interface. The desktop application owns the human-facing workspace; Codex, Claude Code and other harnesses remain the conversation and execution entry. An optional client plugin may distribute installation instructions and workflow skills, but must not be required to use the application or bind the product to one agent vendor.

Use a Tauri 2 shell with the existing React interface. Tauri uses the operating system WebView and supports native windows and tray integration. This gives the application its own window, taskbar entry and lifecycle without a browser address bar. It does not itself improve typography, interaction or terminal behavior; those remain application responsibilities.

Retain the existing Node service, PTY and stdio MCP bridge initially. Package an architecture-matched Node runtime, production dependencies including native PTY binaries, frontend assets and bundled drawing templates as application resources. Do not make ordinary users compile Rust or install application JavaScript dependencies. Their agents still manage their chosen CLI, research environment and optional LaTeX tools. Measure the complete installer and working memory before describing the application as small: a small window shell does not eliminate the Node service or native dependencies.

## First-use and ongoing use

1. Install the application and select an existing research directory, or ask an existing CLI agent to attach that directory.
2. Create or reuse the project-local Paperweave service and storage. Show the active project clearly; never choose a different project merely because an unrelated terminal changed directory.
3. Register the MCP bridge for the user's chosen client, preserving existing configuration. Global registration and project-local routing must remain explicit.
4. Open the workbench directly from its desktop shortcut or the CLI. Reuse an already running matching service instead of opening a second writer for the same vault.

Closing the main desktop window should hide it to the tray while retaining its WebView and embedded terminal sessions. A separate explicit Quit action must explain when embedded processes will end. Merely reopening a window must not create duplicate sessions. External CLI sessions remain external; their process memory is not transplanted into the embedded terminal.

Keep the browser entry for remote/development environments. Publish desktop artifacts through GitHub Releases with platform and architecture labels, checksums and third-party notices. The first desktop milestone targets Windows, followed by actual macOS and Linux verification. Installer signing, update delivery and clean-machine dependency checks need to be completed before describing these packages as a finished public release.

## Agent monitor

ARIS-Monitor is a Claude session triage widget, not a GPU or experiment-metric dashboard. Its current implementation reads Claude's session registry and a bounded transcript tail. It uses a Tkinter floating window and a macOS terminal-focus helper. Its README explicitly excludes Codex approval detection.

Adapt the scanner into an isolated provider behind a shared monitor model, and render the result with Paperweave's interface. Keep upstream attribution and the MIT license with any copied or translated implementation; record the exact source commit and local modifications when code is imported. Do not bundle the macOS focus script as a Windows solution.

The monitor should have two presentations of the same data:

- A compact in-app panel, opened on demand and filterable by project.
- A separate small native window, movable and optionally always on top, which can stay visible while the main workbench is hidden. Show waiting sessions first; never hide a waiting session behind an ordinary row limit. Collapse to a compact indicator when the person wants more screen space.

Each row needs a provider, project, session identity, observed state, observation time and evidence source. Keep registry-derived waiting signals separate from transcript-derived activity estimates. Missing, unreadable, stale or unsupported sources must remain distinguishable from an observed idle session. No transcript text needs to leave the local machine or appear in the summary API.

Clicking a row may focus a known embedded panel. Focusing an external terminal requires a verified platform-specific mapping; when unavailable, identify the project/session instead of simulating keystrokes or claiming the terminal was raised. Monitoring must not approve permission prompts or send commands to research sessions.

For Codex and other harnesses, add a separate provider only after verifying its available event/status interface. Do not infer "waiting for approval" from a quiet terminal or an unfinished tool call. Experiment progress, GPU utilization and result curves are a later provider with its own data sources, not something ARIS-Monitor already supplies.

## Implementation milestones and acceptance

1. Native Windows workbench: packaged launch, own window, project routing, persistent service discovery, tray hide/reopen, and explicit quit behavior. Verify PDF rendering, clipboard and PTY input inside the actual WebView, not only in Edge.
2. Monitor provider: fixture tests for waiting, busy, completed, partial writes, missing registry, stale evidence and unsupported providers. Import code only with its upstream commit and license recorded.
3. Native floating monitor: project filtering, collapse, optional pinning, correct focus routing and accessible dismissal. Verify no session state changes occur from polling.
4. Release artifact: install and uninstall on a clean machine, preserve user research data across upgrades, verify MCP launch from an unrelated working directory, then test platform-specific builds before publishing support claims.

## Sources

- [Tauri architecture](https://v2.tauri.app/concept/architecture/), [sidecar packaging](https://v2.tauri.app/develop/sidecar/), [system tray](https://v2.tauri.app/learn/system-tray/).
- [ARIS-Monitor README](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/tree/main/aris-monitor), [scanner source](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/aris-monitor/scanner.py), [upstream MIT license](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep/blob/main/LICENSE).
