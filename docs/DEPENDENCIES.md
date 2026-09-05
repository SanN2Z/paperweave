# Dependency playbook for installation agents

The aim is a working installation, not a list of missing packages. Detect the OS, CPU architecture, existing package manager, installed runtimes and the user's requested features. Reuse existing tools. Install missing dependencies when authorized by the user's setup request and the host agent's permission system. If the OS requires elevation or interactive login, explain the exact step and continue all independent installation work. Do not weaken TLS verification, write secrets into files, or overwrite unrelated configuration to bypass an installation failure.

## Decision order

1. **Before npm is available**: check `node --version`, `npm --version`, and `git --version`. Node must be at least 22.13; prefer 24 LTS. If absent, install using the OS paths below. Reopen the shell or refresh its PATH, then verify executable versions. Git is needed for cloning/updating; a downloaded source archive is an alternative if Git is unavailable.
2. Clone into a fresh directory, run `npm ci`, then `npm run build`.
3. Run **`node scripts/doctor.js --json`**. This emits JSON only, with `protocol: paperweave-install/1`, `ready`, `checks`, `paths` and `nextSteps`. `npm run doctor -- --json` also works, but npm adds its script banner. Exit code 1 means required checks failed; optional capabilities are separately listed.
4. Repair failed required checks and features the user requested. Retry doctor after each relevant repair; do not repeatedly reinstall working components.
5. Configure the vault / experiment directory, start the service, configure the existing MCP client, then execute the smoke test below.

## Windows 10/11

Use PowerShell. First inspect `Get-Command node,npm,git,winget,python -ErrorAction SilentlyContinue`. Use `npm.cmd` if a PowerShell execution policy blocks the npm `.ps1` wrapper; do not globally disable execution policy.

If WinGet exists, check exact package IDs before installing:

```powershell
winget show --id OpenJS.NodeJS.LTS --exact
winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
winget show --id Git.Git --exact
winget install --id Git.Git --exact --accept-source-agreements --accept-package-agreements
```

Install only what is missing. If WinGet is absent, use the signed installer from [Node.js downloads](https://nodejs.org/en/download) / [Git for Windows](https://gitforwindows.org/) and verify its publisher before executing. Prefer user scope where supported. Reopen the shell to pick up PATH changes.

**Terminal**: `node-pty` is an optional dependency with platform binaries. Try the normal `npm ci` installation first. If doctor reports a native module error, inspect the actual npm build log. If it needs compilation, install Python 3 and Visual Studio Build Tools with the Desktop development with C++ workload, following the [node-pty requirements](https://github.com/microsoft/node-pty#dependencies). Check WinGet's current IDs using `winget search` / `winget show`, install the matching tools, then `npm rebuild node-pty`. Build Tools is a substantial install: it is not needed when the shipped native binary already works.

**LaTeX**: if writing PDF output is requested and `pdflatex` is missing, install [MiKTeX](https://miktex.org/howto/install-miktex) or the user's preferred TeX distribution. A command-line installer is documented in [MiKTeX Setup Utility](https://docs.miktex.org/manual/miktexsetup.html). Use user scope where available. Verify `pdflatex --version`; initialize required packages with MiKTeX Console / package manager. Paperweave disables interactive on-demand package installation during compilation, so a missing `.sty` must be installed beforehand. Do not install the entire TeX package universe when the basic template only needs standard article packages.

For a hidden persistent local server:

```powershell
$paperweaveRoot = (Resolve-Path .).Path
$paperweaveNode = (Get-Command node.exe).Source
Start-Process -FilePath $paperweaveNode -ArgumentList 'server/index.js' -WorkingDirectory $paperweaveRoot -WindowStyle Hidden -RedirectStandardOutput "$paperweaveRoot/.paperweave/server.log" -RedirectStandardError "$paperweaveRoot/.paperweave/server-error.log"
```

Create `.paperweave/` first with `New-Item -ItemType Directory -Force .paperweave`. Do not use a visible helper window unless the user wants one.

## macOS

Inspect `command -v node npm git brew`. If Homebrew is already installed:

```sh
brew install node@24 git
```

Follow Homebrew's printed PATH instructions for `node@24`, rather than force-linking over an existing Node installation. Alternatively use the official Node LTS installer. Install Homebrew only if needed and suitable for the user's environment; inspect its official installation instructions before running an installer.

If node-pty must compile, use the macOS Command Line Tools (`xcode-select --install`) and Python 3, then `npm rebuild node-pty`. This may invoke a system dialog; report it precisely if the agent cannot interact with it.

Paperweave repairs the missing execute bit on node-pty 1.1.0's known macOS `spawn-helper` files during postinstall and startup. This addresses the [upstream macOS packaging issue](https://github.com/microsoft/node-pty/issues/850). If the installation is read-only, copy it into a user-writable application directory or let the agent run `node scripts/prepare-pty.js` with the appropriate installation permissions. This changes only the installed helper files' execute bits.

For PDF compilation, use an existing TeX distribution or install BasicTeX via the user's package manager / [MacTeX](https://tug.org/mactex/morepackages.html). Ensure `/Library/TeX/texbin` is on PATH and verify `pdflatex --version`. Add missing packages with the distribution's package manager.

## Linux

Inspect `/etc/os-release`, architecture and available package managers. The distribution's `nodejs` may be too old: check its candidate version before installing. Use a Node 24 LTS package from a trusted configured source or the official [Node.js download](https://nodejs.org/en/download), verifying the published checksum. A user-owned runtime directory avoids needing system-wide replacement. Do not pipe an uninspected third-party install script into a root shell.

For Debian / Ubuntu, install only missing dependencies:

```sh
sudo apt-get update
sudo apt-get install -y git
# Only if a native PTY build is required:
sudo apt-get install -y python3 make g++
# Only if local PDF compilation is requested:
sudo apt-get install -y texlive-latex-base
```

Use the distribution equivalents on Fedora / Arch / other systems. After native tool setup, run `npm rebuild node-pty`. Do not assume `sudo` is available or bypass the agent's approval mechanism. In containers / remote servers, users need SSH port forwarding to use the loopback UI; do not change the app to bind publicly.

## MCP clients

Paperweave needs any MCP client supporting **stdio tools, resources and prompts**. The research agent supplies its own model access; Paperweave does not need an API key. Detect existing clients first.

- Codex: use `codex mcp add --help` from the installed version, and the absolute command from `npm run setup`. If Codex itself is missing and the user requested it, follow its official installation instructions or the official npm package `@openai/codex`, then let the user complete authentication.
- Claude Code: use `claude mcp add --help`; prefer the [current official installer](https://code.claude.com/docs/en/installation) if the user requested a new installation. Do not install a second agent when an existing one is sufficient.
- Other clients: use the standard `mcpServers` JSON produced by setup, with `command: node` and an absolute `server/mcp.js` argument. Place it in that client's documented configuration file without overwriting its other entries. If a client's configuration format differs, adapt the same command/args/env fields to its current docs.
- MCP subprocesses need the same custom `PAPERWEAVE_DATA_DIR` as the running workbench. Use an absolute Node executable path if the client doesn't inherit the expected PATH. Restart that client after configuration changes.

## Concrete smoke test (required)

1. Start the server and check that `/api/session` reports `protocol: paperweave/1`. Never print or share the token.
2. Through the actual MCP connection, list tools, read `paperweave://context`, and load the `research-workflow` prompt.
3. Create a workspace called `Installation smoke test`; add a clearly labelled fixture paper, save a note, and confirm that the paper and note appear in the browser.
4. Confirm the note exists under the configured vault. Edit it through a file tool, then use `get_note` and verify the edit is visible. Do not use an existing personal note for this test.
5. If a terminal is requested, open it and execute an innocuous marker such as `echo PAPERWEAVE_OK`; confirm it returns output.
6. If LaTeX is requested, create the basic article template, compile, and confirm a non-empty PDF. Handle missing packages from the real log.
7. Report the actual local URL, installation path, vault, configured CLI and any feature that still needs an interactive system step. Do not claim every platform is verified based only on a successful install on one computer.

## Failure recovery

| Failure | Agent action |
| --- | --- |
| `npm` PowerShell execution policy | Use `npm.cmd` |
| `spawn EPERM` in sandbox | Use the host agent's authorized execution path for local build / browser subprocesses; do not disable OS protections |
| npm network / registry failure | Check configured proxy and registry, retry the trusted npm registry or a user-provided trusted mirror; preserve TLS verification |
| Missing native PTY | Install platform build tools if needed, run `npm rebuild node-pty`, restart and check doctor |
| Port already in use | Check whether Paperweave is already running; otherwise choose a free port with `npm run setup -- --port 47832`; use the same data configuration |
| MCP offline | Start workbench, verify data directory and absolute entry path, then retry; a stdio process alone does not start the UI server |
| Note missing after vault change | Restore/copy the previous managed `Paperweave/` directory; do not recreate blank notes over existing metadata |
| Revision conflict | Fetch latest source, merge user changes and resubmit with latest revision |
| LaTeX package missing | Install the named package using the existing TeX package manager, then compile again |
| Browser test browser missing | `npx playwright install chromium`; Linux may also need `npx playwright install --with-deps chromium` |
