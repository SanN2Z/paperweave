import { Node } from "@tiptap/core";

// Keep research notation out of the generic Markdown text escaper. Editable text
// content preserves Obsidian links, citations and TeX, including their delimiters.
function literalNode(name, expression, start, block = false) {
  return Node.create({
    name,
    group: block ? "block" : "inline",
    inline: !block,
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    parseHTML: () => [
      { tag: `${block ? "pre" : "span"}[data-research="${name}"]` },
    ],
    renderHTML: () => [
      block ? "pre" : "span",
      { "data-research": name, class: "research-notation" },
      0,
    ],
    markdownTokenizer: {
      name,
      level: block ? "block" : "inline",
      start,
      tokenize: (source) => {
        const match = source.match(expression);
        return match ? { type: name, raw: match[0] } : undefined;
      },
    },
    parseMarkdown: (token) => ({
      type: name,
      content: [{ type: "text", text: token.raw }],
    }),
    renderMarkdown: (node) =>
      (node.content || []).map((child) => child.text || "").join(""),
  });
}

export const researchMarkdown = [
  literalNode("researchMathBlock", /^\$\$[\s\S]*?\$\$(?:\r?\n|$)/, "$$", true),
  literalNode(
    "researchInline",
    /^(?:!?\[\[[^\n]+?\]\]|\[(?:@|\^)[^\n\]]+\]|\$(?!\$)(?:\\.|[^$\n])+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/,
    (source) => {
      const match = source.match(/!?\[\[|\[(?:@|\^)|\$|\\[([]/);
      return match?.index ?? -1;
    },
  ),
];
