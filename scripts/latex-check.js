import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { startServer } from "../server/index.js";
import { root } from "../server/config.js";
import { freePort } from "../test/fixtures.js";
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "paperweave-latex-"));
const app = await startServer({
  root,
  dataDir: dir,
  vault: path.join(dir, "vault"),
  terminalCwd: root,
  port: await freePort(),
});
try {
  const draft = await app.store.call("save_manuscript", {
    title: "Compilation smoke test",
    format: "tex",
    body: "\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\begin{document}\n\\section{Paperweave compilation check}\nThis PDF was compiled from a manuscript saved through the workbench.\n\\end{document}\n",
  });
  const response = await fetch(
    `${app.origin}/api/manuscripts/${draft.id}/compile`,
    { method: "POST", headers: { Authorization: `Bearer ${app.token}` } },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  const pdf = await fs.readFile(path.join(dir, "files", data.filename));
  if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-")))
    throw new Error("Invalid PDF output");
  await fs.mkdir(path.join(root, "artifacts"), { recursive: true });
  await fs.writeFile(path.join(root, "artifacts", "compiled-check.pdf"), pdf);
  console.log(
    `PASS actual pdflatex compilation and PDF output (${pdf.length} bytes)`,
  );
} finally {
  await app.close();
  await fs.rm(dir, { recursive: true, force: true });
}
