import fs from "node:fs/promises";
import path from "node:path";

export async function projectDataDir(start = process.cwd(), env = process.env) {
  if (env.PAPERWEAVE_DATA_DIR) return path.resolve(env.PAPERWEAVE_DATA_DIR);
  if (env.PAPERWEAVE_PROJECT)
    return path.resolve(env.PAPERWEAVE_PROJECT, ".paperweave");
  let directory = path.resolve(start);
  while (true) {
    try {
      await fs.access(path.join(directory, ".paperweave", "config.json"));
      return path.join(directory, ".paperweave");
    } catch {}
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}
