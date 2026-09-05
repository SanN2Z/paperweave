# Agent installation guide

**Windows desktop installation:** Prefer the published Windows x64 preview installer when the user wants a desktop application. Follow [docs/DESKTOP.md](docs/DESKTOP.md): verify the release checksum, install the current-user package, open the existing project and use the exact connection shown by the application. Node and application dependencies are bundled; do not make the user install Rust or npm. Preserve running services and CLI sessions during an upgrade. The source instructions below remain appropriate for development and other platforms.

**Existing research project:** Install the code separately, run `npm ci` and `npm run build`, then `node /absolute/installation/scripts/project.js init --project /absolute/research/project`. Follow [docs/PROJECTS.md](docs/PROJECTS.md). This adds a `paperweave/` notes workspace, private runtime and project MCP entries while preserving experiments. Keep the current external CLI conversation; use the `project.js context|call` bridge if it cannot reload tools. Do not register a global MCP pointing at a different workspace. The standalone steps below apply when no existing research project was supplied.

Install Paperweave as a local workbench. The user owns the machine, CLI settings and Obsidian vault. Do not upload local papers, notes, CLI credentials or `.paperweave/` to GitHub.

**Missing dependencies are part of the installation task.** Read [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md), detect the actual OS and repair missing prerequisites instead of handing the user an unexplained dependency list. After Node is available, `node scripts/doctor.js --json` provides machine-readable diagnostics. Respect the host agent's existing permissions; only stop for a genuinely required OS interaction or authorization.

For full installation-to-research responsibilities and concise human handoffs, read [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md). The user's brief guide is [docs/USER_GUIDE.md](docs/USER_GUIDE.md); do not make them read the technical playbook to get started.

1. Inspect the OS, Node and Git. Require Node >=22.13 (recommend 24 LTS). Clone this repository into a new directory; never replace unrelated existing files.
2. Run `npm ci` and `npm run build`. Build the application before starting the production server. If node-pty is unavailable, report the missing terminal support; the MCP and reading features still work with an external CLI.
3. Run `npm run setup`. If the user provided an Obsidian vault or experiment directory, use `npm run setup -- --vault "ABSOLUTE_VAULT_PATH" --cwd "ABSOLUTE_EXPERIMENT_PATH"`. Otherwise use the default local vault. Existing note files must be preserved. Changing vault paths requires migrating the managed `Paperweave/` folder first.
4. Choose the user's current CLI with `npm run setup -- --agent codex` or `--agent claude`. The default `auto` detects Codex first, then Claude Code; `--agent shell` opens only a Shell. Register MCP in step 6 before opening the page, so the embedded Agent can read the board immediately.
5. Start `npm start -- --no-browser` for setup verification. It reuses a healthy service or starts one in the background with hidden Windows processes; missing frontend builds are created automatically. Verify `/api/session` responds. This response includes a local token: do not print, commit or send it elsewhere. Use `npm run serve` for foreground service managers and debugging. The default is `http://127.0.0.1:47831`; never expose this PTY service publicly.
6. Register MCP for the CLI the user uses. `npm run setup` prints the absolute path. Examples:

   ```sh
   codex mcp add paperweave -- node "/absolute/path/paperweave/server/mcp.js"
   claude mcp add --transport stdio --scope user paperweave -- node "/absolute/path/paperweave/server/mcp.js"
   ```

   For custom `PAPERWEAVE_DATA_DIR`, also pass that environment variable to the MCP process (use the JSON from setup). Check for an existing `paperweave` MCP entry before changing it. Restart the CLI session after registration. Do not overwrite other MCP entries.

7. Verify `tools/list`, `get_context`, and the `research-workflow` prompt through the actual MCP client. Tests also exercise this handshake: `npm test`. Then run `npm start` to open the page. The first terminal starts the chosen CLI with a short workflow/context greeting prompt. Existing account login and CLI permissions still apply; guide any required first login in that terminal. Automated smoke tests deliberately use Shell, not a paid model session.
8. Explain how to restart the workbench, which vault is in use, and how to begin:

   > Use Paperweave. Read get_context and the research-workflow prompt. Start a new workspace for my research question, verify paper sources, populate structured summaries, build evidence-backed relationships, and save our discussion as notes.

Do not fabricate a pre-populated literature review just to make the board look complete. The screenshots use explicitly labelled synthetic demo data; the user's installation starts with an empty workspace.
