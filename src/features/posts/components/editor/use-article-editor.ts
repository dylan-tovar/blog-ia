"use client";

import { useEditor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { SafeLink } from "@/features/posts/components/editor/safe-link";
import { ARTICLE_PROSE_CLASS } from "@/features/posts/components/markdown-styles";

// Cmd/Ctrl+I is reserved for the AI drawer, so italic keeps only its Shift variant.
const ShiftItalic = Italic.extend({
  addKeyboardShortcuts() {
    return { "Mod-Shift-i": () => this.editor.commands.toggleItalic() };
  },
});

// Tables, images and task lists have no toolbar button: they are registered so
// markdown that already contains them survives an open/edit/save round-trip.
export function useArticleEditor(initialContent: string, onChange: (markdown: string) => void) {
  return useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        italic: false,
        underline: false,
        link: false,
      }),
      ShiftItalic,
      SafeLink,
      Markdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      Table,
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ allowBase64: false }),
      Placeholder.configure({ placeholder: "Escribí tu artículo…" }),
    ],
    content: initialContent,
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: `${ARTICLE_PROSE_CLASS} min-h-[50svh] outline-none`,
        "aria-label": "Contenido del artículo",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  });
}
