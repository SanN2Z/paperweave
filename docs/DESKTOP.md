# Desktop installation and operations

## Shanzi 0.2.2: name and upgrade compatibility

The display name is **扇子 (Shanzi)** and the mascot is an original anthropomorphic folding-fan sprite. Keep `org.paperweave.desktop`, the Windows uninstall registry key, executable name, bundled `paperweave/` resources and existing vault/MCP paths stable. A legacy installation is upgraded in its registered directory; do not move it just to match the new display name. New Windows installations use the product name for their default directory. macOS bundles are now `扇子.app` with the same native identifier and app-data directory.

0.2.1 changed the publisher from `paperweave` to `Paperweave contributors`. Upstream NSIS then read the legacy install directory from the *new* publisher's key and passed an empty `_?=` directory to the old uninstaller. This is why clean-install tests passed while the 0.2.0 upgrade could fail. The template now reads and validates `InstallLocation` from the existing Installed Apps entry, strips its historical surrounding quotes, and invokes the old uninstaller with that exact directory and `/UPDATE` to preserve research data. The installation identity no longer depends on the display brand or publisher.

Before maintenance, the bundled PowerShell helper checks only the current user's desktop/runtime executables at exact paths inside the selected installation. Interactive maintenance asks before closing those processes and explains embedded-session loss. Silent/passive maintenance exits **10** if active; identity/check failures exit **20**. It never kills arbitrary `node.exe` processes, external CLIs or a process tree. An agent may explicitly coordinate sessions and run `scripts/desktop-maintenance.ps1 -InstallDir PATH -Mode Stop` after authorization; use `-Mode Check` for read-only diagnosis. No machine-wide execution policy is changed.

Windows CI downloads the checksum-pinned real 0.2.0 installer, removes its publisher-path value to reproduce the mismatch, starts a bundled Node lock fixture and a separate external Node fixture, verifies busy silent upgrades leave both running, releases only the owned fixture, and runs the actual passive uninstall-before-install flow. It then verifies the new display name, unchanged installation/MCP path, research hashes, uninstall and reinstall. This is separate from testing the native buttons on the user's running desktop.

The native targets are Windows x64 and macOS arm64/x64. The Tauri host uses WebView2 on Windows and system WKWebView on macOS, and bundles Node, production dependencies, PTY binaries, local frontend assets and drawing templates. See [VALIDATION.md](VALIDATION.md) for actual executed results; availability of a build target alone is not a completed acceptance test. Linux desktop installers are not yet validated. Browser/source mode remains available.

## For installation agents

1. Download the Windows installer and `SHA256SUMS.txt` from the matching Paperweave GitHub release. Verify the checksum. Current preview installers are not code-signed; do not claim publisher signing or change OS security settings to bypass a rejection.
2. Install for the current user. The NSIS package supplies shortcuts and an uninstaller. Its WebView2 bootstrapper installs the Microsoft runtime if it is missing and may require a network connection. Rust and npm are build dependencies, not application-user prerequisites.
3. Open Paperweave. Select an existing project with the folder button or tray menu. That explicit selection runs the bundled project initialization, preserving experiments and existing MCP entries. A new project opens in its own native window; other windows and sessions remain mounted.
4. For an external CLI, use **连接 Agent → 复制给 Agent**. The connection contains the bundled Node path, MCP script and exact `PAPERWEAVE_DATA_DIR`, never a token. Merge it into the user's requested client scope. If an existing named entry points elsewhere, resolve the conflict explicitly rather than overwriting unrelated configuration. Keep an existing CLI conversation; newly registered tools may require the client's usual trust/reload step.
5. Verify a real MCP `get_context` call addresses the selected project. The packaged `scripts/project.js context|call --project PATH` bridge remains available using bundled `runtime/node.exe` (Windows) or `runtime/node` (macOS) when the existing CLI cannot reload MCP.
6. Check the requested CLI and optional LaTeX tools separately. The application does not bundle a Claude/Codex account, a TeX distribution or a research Python environment. Follow [DEPENDENCIES.md](DEPENDENCIES.md) for requested missing research tools.

The default native workspace is under the operating-system application-data directory, outside installed program files. Selected projects retain `.paperweave/` runtime state and `paperweave/vault/` research content. Upgrades must preserve both. Do not move or delete a user's vault when uninstalling the application.

Starting with 0.2.1, the Windows installer includes the paper-owl mascot, branded welcome pages, a start-menu **Uninstall Paperweave** shortcut and the normal **Settings → Apps → Installed apps → Paperweave → Uninstall** entry. Uninstallation explicitly retains research data and settings; the generic NSIS delete-app-data checkbox has been removed. The installer follows the system language (Chinese/English). `scripts/desktop-installer-check.ps1` checks install → uninstall → reinstall and exact data retention only on disposable Windows CI runners, never on a researcher's machine.

Windows workbenches use an integrated title bar with native dragging, double-click maximize, minimize, restore and hide-to-tray controls. Windows supplies the resize border and shadow (rounded corners on Windows 11). Closing still keeps embedded sessions alive. macOS retains native window controls. The mascot is shared by the app, installer, uninstaller, taskbar/tray, launcher and browser favicon.

The host retains OS controls until the frontend signals that its title bar is ready. Attaching to an older running service therefore retains its native title bar and active sessions; the new host does not force-restart it for cosmetic updates.

## Window and process lifetime

On macOS, use the menu bar icon to reopen the workbench, choose a project or open the monitor. Reopening from the Dock restores the existing workbench. Native binaries and Node are built on a runner matching the package architecture; there is no Universal bundle. The declared minimum version is macOS 13.5, matching the bundled Node 24 requirement, but the CI machines currently run macOS 15.

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

## macOS automated acceptance

The `macOS desktop` workflow uses separate `macos-15` (arm64) and `macos-15-intel` (x64) machines. It stages production dependencies and executable PTY helpers before signing, builds an `.app` and DMG, and runs `scripts/desktop-macos-check.js`. The script mounts the DMG read-only, copies the application to a temporary Unicode installation path, detaches the image, verifies signature integrity, and launches the copied native executable with Node removed from PATH. It checks the native window through WindowServer, a real bundled stdio MCP connection, and the installed application's service through Playwright WebKit (terminal input/output, PDF text and monitor). All research/session inputs are synthetic.

The native screenshot, WebKit screenshot and machine-readable outcome file are uploaded as validation artifacts. A WindowServer/native startup check and a Playwright WebKit interaction check are separate evidence: Playwright does not drive the system WKWebView in the `.app`. Clipboard shortcuts, native monitor pin/collapse, Dock/menu interactions and ordinary Finder installation still need manual Mac acceptance.

Use `macOS installed app recheck` with the original build run ID to verify retained DMGs without rebuilding them. The script launches a canonical installation path: macOS's temporary `/var` directory is a symlink to `/private/var`, and Tauri intentionally rejects executable paths containing symlinks. Do not enable the dangerous symlink feature to make a fixture pass. For DMGs containing the project's license, the harness supplies explicit acceptance on stdin and bounds each external command with a timeout.

Current macOS packages use [Tauri's ad-hoc signing](https://v2.tauri.app/distribute/sign/macos/). This verifies bundle integrity for testing; it is not Developer ID signing or Apple notarization. Do not disable Gatekeeper, strip quarantine or change machine security settings to turn a failed download/installation check into a pass. Production distribution needs signing/notarization separately. Rust/Xcode are build-machine requirements, not application-user requirements.
