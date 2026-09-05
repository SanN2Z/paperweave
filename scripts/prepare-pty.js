import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// node-pty 1.1.0 publishes macOS helpers as 0644 (upstream issue #850).
// Repair only executable bits on this installed package's known helper files.
export async function preparePty() {
  if (process.platform !== "darwin") return;
  let base;
  try {
    base = path.dirname(require.resolve("node-pty/package.json"));
  } catch {
    return;
  }
  for (const relative of [
    "prebuilds/darwin-arm64/spawn-helper",
    "prebuilds/darwin-x64/spawn-helper",
    "build/Release/spawn-helper",
  ]) {
    const file = path.join(base, relative);
    try {
      const stat = await fs.lstat(file);
      if (
        stat.isFile() &&
        !stat.isSymbolicLink() &&
        (stat.mode & 0o111) !== 0o111
      )
        await fs.chmod(file, stat.mode | 0o111);
    } catch (e) {
      if (e.code !== "ENOENT")
        console.error(
          `Paperweave: unable to set PTY helper executable permission: ${e.message}`,
        );
    }
  }
}
await preparePty();
