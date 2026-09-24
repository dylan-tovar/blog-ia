"use client";

import { useEffect, useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import { Markdown } from "@tiptap/markdown";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Italic from "@tiptap/extension-italic";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import StarterKit from "@tiptap/starter-kit";
import { SafeLink } from "@/features/posts/components/editor/safe-link";
import { useImageUpload } from "@/features/posts/components/editor/use-image-upload";
import { ARTICLE_PROSE_CLASS } from "@/features/posts/components/markdown-styles";
import { shouldInterceptPaste } from "@/features/posts/images/image-utils";

// Cmd/Ctrl+I is reserved for the AI drawer, so italic keeps only its Shift variant.
const ShiftItalic = Italic.extend({
  addKeyboardShortcuts() {
    return { "Mod-Shift-i": () => this.editor.commands.toggleItalic() };
  },
});

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith("image/"));
}

// Tables and task lists have no toolbar button: they are registered so markdown that
// already contains them survives an open/edit/save round-trip. Images do (see EditorToolbar),
// and can also be dropped or pasted into the article.
export function useArticleEditor(initialContent: string, onChange: (markdown: string) => void) {
  const editorRef = useRef<Editor | null>(null);
  const images = useImageUpload(editorRef);
  const { insertFiles } = images;

  const editor = useEditor({
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
      Highlight,
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
      handleDrop(view, event, _slice, moved) {
        const files = moved ? [] : imageFiles(event.dataTransfer?.files);
        if (files.length === 0) {
          return false;
        }
        event.preventDefault();
        const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertFiles(files, position);
        return true;
      },
      handlePaste(_view, event) {
        if (!shouldInterceptPaste(event.clipboardData)) {
          return false;
        }
        event.preventDefault();
        insertFiles(imageFiles(event.clipboardData?.files));
        return true;
      },
    },
    onUpdate: ({ editor: updated }) => onChange(updated.getMarkdown()),
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  return { editor, images };
}
