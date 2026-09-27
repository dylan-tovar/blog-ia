"use client";

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { useEditorOutline } from "@/features/posts/components/editor/use-editor-outline";
import { cn } from "@/lib/utils";

export function EditorOutline({ editor }: { editor: Editor | null }) {
  const headings = useEditorOutline(editor);
  const [activePos, setActivePos] = useState<number | null>(null);
  const nodesRef = useRef<Map<number, Element>>(new Map());

  useEffect(() => {
    if (!editor || headings.length < 2) return;
    const entries = headings
      .map((h) => {
        const dom = editor.view.domAtPos(h.pos + 1).node;
        const el = dom instanceof Element ? dom : dom.parentElement;
        return el ? ([h.pos, el] as const) : null;
      })
      .filter((e): e is readonly [number, Element] => e !== null);
    nodesRef.current = new Map(entries);

    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topMost = visible.reduce((a, b) => (a.boundingClientRect.top < b.boundingClientRect.top ? a : b));
        const match = entries.find(([, el]) => el === topMost.target);
        if (match) setActivePos(match[0]);
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 },
    );
    entries.forEach(([, el]) => observer.observe(el));
    return () => observer.disconnect();
  }, [editor, headings]);

  if (!editor || headings.length < 2) return null;

  function goTo(pos: number) {
    if (!editor) return;
    const el = nodesRef.current.get(pos);
    // focus()'s own scroll-into-view would fight the smooth one just triggered above.
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    editor.chain().setTextSelection(pos).focus(undefined, { scrollIntoView: false }).run();
  }

  return (
    <nav
      aria-label="Estructura del artículo"
      className="sticky top-(--editor-header-h) hidden h-[calc(100svh-var(--editor-header-h))] w-12 shrink-0 flex-col items-end gap-1.5 overflow-y-auto px-3 py-8 xl:flex"
    >
      {headings.map((h) => (
        <button
          key={h.pos}
          type="button"
          title={h.text || "Sin título"}
          aria-current={activePos === h.pos ? "true" : undefined}
          onClick={() => goTo(h.pos)}
          className={cn(
            "h-0.5 rounded-full bg-muted-foreground/30 transition-all hover:bg-muted-foreground/60",
            h.level === 2 ? "w-6" : "w-4",
            activePos === h.pos && "bg-primary",
          )}
        />
      ))}
    </nav>
  );
}
