import fs from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./schemas.js";
import { configuration } from "./config.js";

const config = await configuration();
const server = new McpServer(
  { name: "paperweave", version: "0.1.0" },
  {
    instructions:
      "Use the research-workflow prompt. Read get_context silently for grounding and then ANSWER the user's actual question. Never substitute workspace inventories or reading status for an explanation. A request like '讲一下' means explain the selected source, using read_paper as needed. Continue after tool calls to a substantive response. Never invent sources or results.",
  },
);
async function call(name, args) {
  let runtime;
  try {
    runtime = JSON.parse(
      await fs.readFile(path.join(config.dataDir, "runtime.json"), "utf8"),
    );
  } catch {
    throw new Error(
      "Start Paperweave first: npm start in its installation directory",
    );
  }
  const url = new URL(runtime.url);
  if (url.hostname !== "127.0.0.1")
    throw new Error("Runtime endpoint must be loopback");
  let res;
  try {
    res = await fetch(`${runtime.url}/api/tools/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtime.token}`,
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(
      "Paperweave is offline. Run npm start, then retry this tool.",
    );
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
for (const [name, def] of Object.entries(tools))
  server.registerTool(
    name,
    {
      description: def.description,
      inputSchema: def.schema.shape,
      annotations: {
        readOnlyHint: [
          "get_context",
          "list_papers",
          "read_paper",
          "get_note",
          "get_manuscript",
          "list_templates",
          "get_template",
          "get_figure",
          "scan_project",
          "read_project_artifact",
        ].includes(name),
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      try {
        return {
          content: [
            { type: "text", text: JSON.stringify(await call(name, args)) },
          ],
        };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: e.message }] };
      }
    },
  );
server.registerResource(
  "dashboard-context",
  "paperweave://context",
  {
    mimeType: "application/json",
    description: "Live user reading context and active research workspace",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(await call("get_context", {})),
      },
    ],
  }),
);
server.registerPrompt(
  "research-workflow",
  {
    description:
      "The repeatable field-review, close-reading, diagram and note-taking contract",
  },
  async () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: await fs.readFile(
            path.join(config.root, "docs", "WORKFLOW.md"),
            "utf8",
          ),
        },
      },
    ],
  }),
);
await server.connect(new StdioServerTransport());
