import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteAttachmentPath } from "../server/terminal-attachments.js";

test("attachment paths preserve Chinese, spaces and shell metacharacters as data", () => {
  assert.equal(
    quoteAttachmentPath("C:/研究资料/a b/image.png", "powershell.exe"),
    "'C:/研究资料/a b/image.png'",
  );
  assert.equal(
    quoteAttachmentPath("C:/a'b/$()/image.png", "pwsh"),
    "'C:/a''b/$()/image.png'",
  );
  assert.equal(
    quoteAttachmentPath("/a'b/$(test)/image.png", "/bin/zsh"),
    "'/a'\\''b/$(test)/image.png'",
  );
  assert.equal(
    quoteAttachmentPath("/a'b/image.png", "/bin/fish"),
    "'/a\\'b/image.png'",
  );
  assert.equal(
    quoteAttachmentPath("C:/a b/image.png", "cmd.exe"),
    '"C:/a b/image.png"',
  );
  assert.throws(() => quoteAttachmentPath("C:/%temp%/image.png", "cmd.exe"));
  assert.throws(() => quoteAttachmentPath("/a\nb/image.png", "/bin/bash"));
});
