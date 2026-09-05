import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const attachmentLimit = 20 * 1024 * 1024;

function imageExtension(bytes) {
  if (!Buffer.isBuffer(bytes)) return null;
  if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return "png";
  if (
    bytes.length >= 4 &&
    bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  )
    return "jpg";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";
  if (
    bytes.length >= 13 &&
    ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))
  )
    return "gif";
  return null;
}

// A pasted path is also usable in a plain shell. Never introduce a newline or
// allow a workspace name to become shell syntax. The browser never sends Enter.
export function quoteAttachmentPath(file, shell) {
  if (/[\x00-\x1f\x7f]/.test(file))
    throw new Error("工作空间路径包含控制字符，无法粘贴图片路径。");
  const name = path
    .basename(shell)
    .toLowerCase()
    .replace(/\.exe$/, "");
  if (["powershell", "pwsh"].includes(name))
    return `'${file.replaceAll("'", "''")}'`;
  if (name === "cmd") {
    if (/["%!]/.test(file))
      throw new Error(
        "当前 CMD 无法安全粘贴此工作空间路径，请改用 PowerShell。",
      );
    return `"${file}"`;
  }
  if (name === "fish")
    return `'${file.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  return `'${file.replaceAll("'", "'\\''")}'`;
}

export async function saveTerminalAttachment(config, shell, bytes) {
  if (bytes?.length > attachmentLimit)
    throw Object.assign(new Error("图片过大，请使用不超过 20 MB 的图片。"), {
      status: 413,
    });
  const ext = imageExtension(bytes);
  if (!ext) throw new Error("请粘贴 PNG、JPEG、WebP 或 GIF 图片。");
  const directory = path.join(config.dataDir, "attachments");
  const file = path.join(directory, `clipboard-${randomUUID()}.${ext}`);
  const pasteText = `${quoteAttachmentPath(file, shell)} `;
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(file, bytes, { flag: "wx", mode: 0o600 });
  // Keep the file for later conversation turns. Do not register temporary
  // screenshots as scientific figures, or delete them when a terminal closes.
  return { path: file, pasteText };
}
