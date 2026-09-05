import React, { useEffect, useRef } from "react";
import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import {
  Pilcrow,
  Heading2,
  Bold,
  Italic,
  List,
  ListTodo,
  Quote,
  Code2,
  Undo2,
} from "lucide-react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { researchMarkdown } from "./researchMarkdown";

function splitDocument(value) {
  const metadata =
    value.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)*/)?.[0] || "";
  return { metadata, content: value.slice(metadata.length) };
}

export default function VisualMarkdown({
  value,
  onChange,
  label = "Markdown 可视化编辑",
}) {
  const current = useRef({ value, onChange });
  current.current.onChange = onChange;
  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
      TableKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Image,
      ...researchMarkdown,
    ],
    content: splitDocument(value).content,
    contentType: "markdown",
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) => {
      const next =
        splitDocument(current.current.value).metadata + editor.getMarkdown();
      current.current.value = next;
      current.current.onChange(next);
    },
  });
  useEffect(() => {
    if (editor && value !== current.current.value) {
      current.current.value = value;
      editor.commands.setContent(splitDocument(value).content, {
        contentType: "markdown",
        emitUpdate: false,
      });
    }
  }, [value, editor]);
  const formats = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? [
            "paragraph",
            "heading",
            "bold",
            "italic",
            "bulletList",
            "taskList",
            "blockquote",
            "codeBlock",
          ].filter((name) => editor.isActive(name))
        : [],
  });
  if (!editor) return null;
  const actions = [
    [
      "正文",
      Pilcrow,
      "paragraph",
      () => editor.chain().focus().setParagraph().run(),
    ],
    [
      "标题",
      Heading2,
      "heading",
      () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    ],
    [
      "粗体 · Ctrl+B",
      Bold,
      "bold",
      () => editor.chain().focus().toggleBold().run(),
    ],
    [
      "斜体 · Ctrl+I",
      Italic,
      "italic",
      () => editor.chain().focus().toggleItalic().run(),
    ],
    [
      "列表",
      List,
      "bulletList",
      () => editor.chain().focus().toggleBulletList().run(),
    ],
    [
      "待办",
      ListTodo,
      "taskList",
      () => editor.chain().focus().toggleTaskList().run(),
    ],
    [
      "引用",
      Quote,
      "blockquote",
      () => editor.chain().focus().toggleBlockquote().run(),
    ],
    [
      "代码",
      Code2,
      "codeBlock",
      () => editor.chain().focus().toggleCodeBlock().run(),
    ],
    ["撤销 · Ctrl+Z", Undo2, "undo", () => editor.chain().focus().undo().run()],
  ];
  return (
    <div className="visual-markdown">
      <div
        className="visual-markdown-toolbar"
        role="toolbar"
        aria-label="Markdown 格式"
      >
        {actions.map(([name, Icon, format, action]) => (
          <button
            key={name}
            type="button"
            title={name}
            aria-label={name}
            aria-pressed={
              format === "undo" ? undefined : formats?.includes(format)
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={action}
          >
            <Icon size={15} strokeWidth={1.6} />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} className="markdown" />
    </div>
  );
}
