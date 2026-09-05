# Agent installation guide

Install Paperweave as a local workbench. The user owns the machine, CLI settings and Obsidian vault. Do not upload local papers, notes, CLI credentials or `.paperweave/` to GitHub.

**Missing dependencies are part of the installation task.** Read [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md), detect the actual OS and repair missing prerequisites instead of handing the user an unexplained dependency list. After Node is available, `node scripts/doctor.js --json` provides machine-readable diagnostics. Respect the host agent's existing permissions; only stop for a genuinely required OS interaction or authorization.

For full installation-to-research responsibilities and concise human handoffs, read [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md). The user's brief guide is [docs/USER_GUIDE.md](docs/USER_GUIDE.md); do not make them read the technical playbook to get started.

1. Inspect the OS, Node and Git. Require Node >=22.13 (recommend 24 LTS). Clone this repository into a new directory; never replace unrelated existing files.
2. Run `npm ci` and `npm run build`. Build the application before starting the production server. If node-pty is unavailable, report the missing terminal support; the MCP and reading features still work with an external CLI.
3. Run `npm run setup`. If the user provided an Obsidian vault or experiment directory, use `npm run setup -- --vault "ABSOLUTE_VAULT_PATH" --cwd "ABSOLUTE_EXPERIMENT_PATH"`. Otherwise use the default local vault. Existing note files must be preserved. Changing vault paths requires migrating the managed `Paperweave/` folder first.
4. Start `npm start` in a persistent terminal or a hidden background process appropriate to the OS. On Windows, `Start-Process` background helpers must use `-WindowStyle Hidden`. The service binds to `http://127.0.0.1:47831` by default. Do not expose the PTY service publicly.
5. Verify `/api/session` responds and open the dashboard. The session response includes a local token: do not print, commit or send it elsewhere.
6. Register MCP for the CLI the user uses. `npm run setup` prints the absolute path. Examples:

   ```sh
   codex mcp add paperweave -- node "/absolute/path/paperweave/server/mcp.js"
   claude mcp add --transport stdio --scope user paperweave -- node "/absolute/path/paperweave/server/mcp.js"
   ```

   For custom `PAPERWEAVE_DATA_DIR`, also pass that environment variable to the MCP process (use the JSON from setup). Check for an existing `paperweave` MCP entry before changing it. Restart the CLI session after registration. Do not overwrite other MCP entries.

7. Verify `tools/list`, `get_context`, and the `research-workflow` prompt through the actual MCP client. Tests also exercise this handshake: `npm test`.
8. Explain how to restart the workbench, which vault is in use, and how to begin:

   > Use Paperweave. Read get_context and the research-workflow prompt. Start a new workspace for my research question, verify paper sources, populate structured summaries, build evidence-backed relationships, and save our discussion as notes.

Do not fabricate a pre-populated literature review just to make the board look complete. The screenshots use explicitly labelled synthetic demo data; the user's installation starts with an empty workspace.
