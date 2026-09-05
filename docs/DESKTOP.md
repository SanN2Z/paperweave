# Desktop installation and operations

The first native target is Windows x64. The Tauri host uses WebView2 and bundles Node, production dependencies, PTY binaries, local frontend assets and drawing templates. macOS/Linux desktop installers are not yet validated. Browser/source mode remains available.

## For installation agents

1. Download the Windows installer and `SHA256SUMS.txt` from the matching Paperweave GitHub release. Verify the checksum. Current preview installers are not code-signed; do not claim publisher signing or change OS security settings to bypass a rejection.
2. Install for the current user. The NSIS package supplies shortcuts and an uninstaller. Its WebView2 bootstrapper installs the Microsoft runtime if it is missing and may require a network connection. Rust and npm are build dependencies, not application-user prerequisites.
3. Open Paperweave. Select an existing project with the folder button or tray menu. That explicit selection runs the bundled project initialization, preserving experiments and existing MCP entries. A new project opens in its own native window; other windows and sessions remain mounted.
4. For an external CLI, use **连接 Agent → 复制给 Agent**. The connection contains the bundled Node path, MCP script and exact `PAPERWEAVE_DATA_DIR`, never a token. Merge it into the user's requested client scope. If an existing named entry points elsewhere, resolve the conflict explicitly rather than overwriting unrelated configuration. Keep an existing CLI conversation; newly registered tools may require the client's usual trust/reload step.
5. Verify a real MCP `get_context` call addresses the selected project. The packaged `scripts/project.js context|call --project PATH` bridge remains available using bundled `runtime/node.exe` when the existing CLI cannot reload MCP.
6. Check the requested CLI and optional LaTeX tools separately. The application does not bundle a Claude/Codex account, a TeX distribution or a research Python environment. Follow [DEPENDENCIES.md](DEPENDENCIES.md) for requested missing research tools.

The default native workspace is under the operating-system application-data directory, outside installed program files. Selected projects retain `.paperweave/` runtime state and `paperweave/vault/` research content. Upgrades must preserve both. Do not move or delete a user's vault when uninstalling the application.

## Window and process lifetime

- Closing a workbench or monitor window hides it. The tray restores the existing WebView; embedded terminals remain connected.
- The monitor's workbench button restores its associated project window. Other projects have separate windows and services.
- **退出…** in the tray asks before ending the desktop application's embedded sessions. External CLIs are untouched. Local MCP services remain running so external clients can continue using them.
- The desktop reuses a service only when its on-disk runtime and `/api/session` token match. Ports alone do not establish workspace identity.
- Updating an already running old service is a separate lifecycle action. Preserve running experiments and confirm the state of embedded sessions before restarting it. An old service without `get_monitor` remains usable for its existing features but cannot supply the new monitor.

CLI launch accepts `--project ABSOLUTE_DIRECTORY` and `--data-dir ABSOLUTE_DATA_DIRECTORY`. The latter supports explicit existing-space attachment and isolated verification; it does not replace the remembered default project. No runtime token is accepted on the command line.

## Monitor semantics

The ARIS-derived Claude provider reads the selected Claude configuration home (`CLAUDE_CONFIG_DIR`, otherwise `~/.claude`) and never executes upstream focus scripts. It distinguishes missing/unavailable/partial sources, registry waiting, transcript estimates, stale evidence and unknown status. No transcript text is included in the summary response. Codex live status is marked unsupported.

The native monitor supports pin/unpin, collapse, project filtering and returning to its workbench. Expanding a session shows its project and observation time. External terminal focusing is not implemented: the UI identifies the session instead of simulating keys or claiming it was raised. The monitor never grants approval.

## Build and verification

```sh
npm ci
npm run build
npm test
npm run test:browser
npm run desktop:stage
node scripts/desktop-licenses.js
npm run desktop:build
```

Windows build machines need the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), including Rust and MSVC. The `Windows desktop` GitHub workflow builds an NSIS installer, checksums and a Cargo lock artifact. `desktop:stage` copies an allowlist of product files and installs locked production dependencies; it never packages the development vault or runtime tokens.

After installing a candidate, run `scripts/desktop-check.js` with `PAPERWEAVE_DESKTOP_EXE` set to the installed executable. It uses temporary research and Claude fixtures and WebView2's loopback debugging connection. Node and CLI directories are removed from the application's PATH during this check. It verifies the actual native WebView, PTY, PDF, monitor and hide/restore behavior. Debugging is enabled only for this test process, not in the shipped application configuration. Screenshots under `artifacts/desktop-*.png` are synthetic.

Complete release validation must distinguish these checks from signing, a pristine Windows VM, macOS/Linux support, external terminal focus and unattended updates. Do not present planned capabilities as shipped.
