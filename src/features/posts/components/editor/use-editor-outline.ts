"use client";

import { useEditorState, type Editor } from "@tiptap/react";

export interface OutlineHeading {
  level: 2 | 3;
  text: string;
  pos: number;
}

export function useEditorOutline(editor: Editor | null): OutlineHeading[] {
  return (
    useEditorState({
      editor,
      selector: ({ editor: current }) => {
        if (!current) return [];
        const headings: OutlineHeading[] = [];
        current.state.doc.descendants((node, pos) => {
          if (node.type.name === "heading") {
            headings.push({ level: node.attrs.level as 2 | 3, text: node.textContent, pos });
          }
        });
        return headings;
      },
    }) ?? []
  );
}
