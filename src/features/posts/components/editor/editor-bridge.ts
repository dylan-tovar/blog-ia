import type { Editor } from "@tiptap/react";
import { closeHistory, undoDepth } from "@tiptap/pm/history";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { planApply, type UndoToken } from "./apply-action";
import {
  buildLiveDoc,
  buildSnapshot,
  type DocNode,
  type EditorBridge,
  type EditorSnapshot,
  type PositionedNode,
} from "./editor-context";

// Thin Tiptap adapter over the pure logic in editor-context.ts and apply-action.ts; it needs a real
// ProseMirror document, so it is covered by the Playwright suite instead of Vitest (node only).

function positionedNodes(editor: Editor): PositionedNode[] {
  const nodes: PositionedNode[] = [];
  editor.state.doc.forEach((node, offset) => {
    nodes.push({ node: node.toJSON() as DocNode, from: offset, to: offset + node.nodeSize });
  });
  return nodes;
}

const serializerFor = (editor: Editor) => (node: DocNode) =>
  editor.markdown?.serialize({ type: "doc", content: [node] }) ?? "";

export function readEditorSnapshot(editor: Editor | null, title: string): EditorSnapshot {
  if (!editor) return buildSnapshot({ title, nodes: [], selection: null, serialize: () => "" });

  const { doc, selection } = editor.state;

  return buildSnapshot({
    title,
    nodes: positionedNodes(editor),
    selection: selection.empty
      ? null
      : { from: selection.from, to: selection.to, text: doc.textBetween(selection.from, selection.to, "\n") },
    serialize: serializerFor(editor),
  });
}

function readLiveDoc(editor: Editor) {
  const { doc, selection } = editor.state;

  return buildLiveDoc({
    nodes: positionedNodes(editor),
    selection: { from: selection.from, to: selection.to, head: selection.head, text: doc.textBetween(selection.from, selection.to, "\n") },
    endPos: doc.content.size,
    markdownLength: editor.getMarkdown().length,
    serialize: serializerFor(editor),
  });
}

type UndoEntry = { docAfter: ProseMirrorNode; depth: number };

const UNAVAILABLE = "El editor todavía no está listo. Probá de nuevo en un momento.";

// Kept per editor, not per bridge: the bridge is rebuilt when the title changes but the history it
// points into is the editor's.
const undoRegistry = new WeakMap<Editor, Map<string, UndoEntry>>();
let undoCounter = 0;

function undoEntriesOf(editor: Editor) {
  let entries = undoRegistry.get(editor);
  if (!entries) {
    entries = new Map();
    undoRegistry.set(editor, entries);
  }
  return entries;
}

export function createEditorBridge(editor: Editor | null, title: string): EditorBridge {
  return {
    getSnapshot: () => readEditorSnapshot(editor, title),

    apply(action, snapshot) {
      if (!editor) return { ok: false, reason: "unavailable", message: UNAVAILABLE };

      const plan = planApply(action, snapshot, readLiveDoc(editor));
      if (!plan.ok) return plan;

      // Closing the history on both sides keeps this change a step of its own: without it, typing
      // right before or after would be merged into the same Ctrl+Z step.
      editor.view.dispatch(closeHistory(editor.state.tr));
      const applied = editor
        .chain()
        .insertContentAt({ from: plan.placement.from, to: plan.placement.to }, action.markdown, { contentType: "markdown" })
        .run();
      if (!applied) return { ok: false, reason: "unavailable", message: "No pudimos aplicar el cambio en el editor." };
      editor.view.dispatch(closeHistory(editor.state.tr));

      const id = `undo-${++undoCounter}`;
      undoEntriesOf(editor).set(id, { docAfter: editor.state.doc, depth: undoDepth(editor.state) });
      return { ok: true, undo: { id } satisfies UndoToken };
    },

    undo(token) {
      const entries = editor ? undoEntriesOf(editor) : null;
      const entry = entries?.get(token.id);
      if (!editor || !entries || !entry) return { ok: false, message: "Este cambio ya no se puede deshacer desde acá." };

      // Only our own step may be undone: if anything else was recorded since, Ctrl+Z would revert that instead.
      if (!editor.state.doc.eq(entry.docAfter) || undoDepth(editor.state) !== entry.depth) {
        return {
          ok: false,
          message: "Editaste el artículo después de aplicar este cambio, así que no se puede deshacer desde acá. Deshacé primero los cambios posteriores o usá Ctrl+Z en el editor.",
        };
      }

      entries.delete(token.id);
      return editor.commands.undo() ? { ok: true } : { ok: false, message: "No pudimos deshacer el cambio." };
    },
  };
}
