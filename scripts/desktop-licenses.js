import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { root } from "../server/config.js";

const { stdout } = await promisify(execFile)(
  "cargo",
  [
    "metadata",
    "--locked",
    "--format-version",
    "1",
    "--filter-platform",
    "x86_64-pc-windows-msvc",
    "--manifest-path",
    "src-tauri/Cargo.toml",
  ],
  { cwd: root, windowsHide: true, maxBuffer: 32 * 1024 * 1024 },
);
const metadata = JSON.parse(stdout);
const sections = [
  "Paperweave desktop — Rust dependency notices\n\nThe following are the original license and notice texts for the resolved native dependencies. Source repositories are listed with each package. Unmodified package sources are also available from crates.io.",
];
for (const pkg of metadata.packages
  .filter((p) => p.source)
  .sort((a, b) => a.name.localeCompare(b.name))) {
  const directory = path.dirname(pkg.manifest_path);
  const files = (await fs.readdir(directory)).filter((name) =>
    /^(licen[cs]e|copying|copyright|notice)([._-]|$)/i.test(name),
  );
  if (pkg.license_file && !files.includes(pkg.license_file))
    files.push(pkg.license_file);
  const texts = [];
  for (const file of files) {
    const full = path.join(directory, file),
      info = await fs.stat(full);
    if (info.isFile())
      texts.push(`${file}\n${await fs.readFile(full, "utf8")}`);
  }
  sections.push(
    `\n${"=".repeat(72)}\n${pkg.name} ${pkg.version}\n${pkg.repository || `https://crates.io/crates/${pkg.name}/${pkg.version}`}\nLicense: ${pkg.license || "see included license file"}\n\n${texts.join("\n\n") || "See the package's published source for its license text."}`,
  );
}
const destination = path.join(
  root,
  "src-tauri/resources/paperweave/third-party/RUST-NOTICES.txt",
);
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, sections.join("\n\n") + "\n");
console.log(
  `Included native dependency license notices for ${metadata.packages.filter((p) => p.source).length} packages.`,
);
