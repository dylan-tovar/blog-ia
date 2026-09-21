"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { EditorContent } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { AiChatDrawer } from "@/features/ai/components/chat/AiChatDrawer";
import { AI_DRAWER_STORAGE_KEY, parseDrawerOpen, shortcutLabel } from "@/features/ai/components/chat/ai-drawer";
import { QuickActions, QuickActionsGrid } from "@/features/ai/components/chat/QuickActions";
import type { InsertTarget } from "@/features/ai/components/chat/chat-state";
import { useChat } from "@/features/ai/components/chat/use-chat";
import { useAiDrawerShortcut } from "@/features/ai/components/chat/use-ai-drawer-shortcut";
import { useAiRequest } from "@/features/ai/components/use-ai-request";
import type { Tone } from "@/features/ai/schemas";
import { TONE_LABELS } from "@/features/ai/components/ai-ui";
import { POST_TITLE_MAX_LENGTH } from "@/features/posts/constants";
import type { ApplyOutcome } from "@/features/posts/components/editor/apply-action";
import { createEditorBridge } from "@/features/posts/components/editor/editor-bridge";
import { EditorToolbar } from "@/features/posts/components/editor/EditorToolbar";
import { EditorTopBar } from "@/features/posts/components/editor/EditorTopBar";
import { PublishDialog } from "@/features/posts/components/editor/PublishDialog";
import type { CoverValue } from "@/features/posts/cover/cover-schema";
import { useArticleEditor } from "@/features/posts/components/editor/use-article-editor";
import { useAutosave } from "@/features/posts/components/editor/use-autosave";
import { MarkdownContent } from "@/features/posts/components/MarkdownContent";

type Tag = { id: string; name: string };

const HEADER_HEIGHT_VAR = { "--editor-header-h": "3.5rem" } as CSSProperties;

// Only runs on the client: DesktopOnly renders nothing on the server, so there is no hydration mismatch.
function readDrawerOpen() {
  try {
    return parseDrawerOpen(window.localStorage.getItem(AI_DRAWER_STORAGE_KEY));
  } catch {
    return false;
  }
}

function writeDrawerOpen(open: boolean) {
  try {
    window.localStorage.setItem(AI_DRAWER_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // Persistence is a per-viewer convenience; the drawer still works without it.
  }
}

interface PostEditorProps {
  postId: string;
  status: string;
  initialTitle: string;
  initialContent: string;
  initialTags: Tag[];
  initialCover: CoverValue;
  allTagNames: string[];
  rejectionReason: string | null;
}

export function PostEditor({
  postId,
  status: initialStatus,
  initialTitle,
  initialContent,
  initialTags,
  initialCover,
  allTagNames,
  rejectionReason: initialRejection,
}: PostEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState(initialStatus);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [rejectionReason, setRejectionReason] = useState(initialRejection);
  const [previewing, setPreviewing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(readDrawerOpen);
  const [aiShortcut] = useState(() => shortcutLabel(window.navigator.platform));
  const drawerRef = useRef<HTMLElement>(null);

  const ai = useAiRequest();

  const { saveState, update, persist, getContent } = useAutosave(postId, {
    title: initialTitle,
    content: initialContent,
  });

  const { editor, images } = useArticleEditor(initialContent, (markdown) => {
    setContent(markdown);
    update({ content: markdown });
  });

  const bridge = useMemo(() => createEditorBridge(editor, title), [editor, title]);

  // "Insert at cursor" only makes sense once the author has put a cursor in the article.
  const [hasCursor, setHasCursor] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const markCursor = () => setHasCursor(true);
    editor.on("focus", markCursor);
    return () => {
      editor.off("focus", markCursor);
    };
  }, [editor]);

  const chat = useChat({ runSlot: ai.runSlot, busy: ai.busy, bridge });

  function setDrawer(next: boolean) {
    // Inert content loses focus silently, so hand it back to the editor before closing.
    if (!next && drawerRef.current?.contains(document.activeElement)) {
      editor?.commands.focus();
    }
    setAiOpen(next);
    writeDrawerOpen(next);
  }

  useAiDrawerShortcut(() => setDrawer(!aiOpen));

  const canPublish = status === "draft" || status === "rejected" || status === "pending_review";

  // Manual insertion goes through the same engine (and the same length check) as the AI proposals.
  function insertMarkdown(markdown: string, target: InsertTarget): ApplyOutcome {
    const action = target === "cursor" ? ({ op: "insert_at_selection", markdown } as const) : ({ op: "append", markdown } as const);
    // Without a selection in the snapshot, "cursor" means the caret itself.
    return bridge.apply(action, { ...bridge.getSnapshot(), selection: null });
  }

  function handleOutlineTool() {
    const topic = title.trim();
    const prompt = topic
      ? `Armá una estructura (outline) con títulos H2 y H3 para un artículo sobre "${topic}" y proponela como un cambio que pueda aplicar en el artículo.`
      : "Armá una estructura (outline) con títulos H2 y H3 para este artículo y proponela como un cambio que pueda aplicar en el artículo.";
    chat.send(prompt);
  }

  // Titles stay a text answer for now; an "use this title" action is a follow-up.
  function handleTitlesTool() {
    chat.send("Sugerime 5 opciones de títulos atractivos, creativos y optimizados para SEO para este artículo. Respondé solo con la lista, sin modificar el artículo.");
  }

  function handleToneTool(selectedTone: Tone) {
    const tone = TONE_LABELS[selectedTone].toLowerCase();
    chat.send(
      `Reescribí TODO el artículo completo con un tono ${tone}, de principio a fin, manteniendo la estructura de títulos e ideas principales. Si hay texto seleccionado en el editor, ignoralo y abarcá el artículo completo. Proponé el reemplazo de la totalidad del texto en una sola propuesta con replace_range (o replace_block si es un solo bloque).`,
    );
  }

  function handleScoreTool() {
    chat.send(
      "Realizá una auditoría y análisis editorial crítico de TODO el artículo completo, de principio a fin (evaluando todo el texto e ignorando cualquier selección). " +
      "Presentá la evaluación mediante la herramienta present_analysis con el score global (0-100), métricas por dimensión, veredicto, fortalezas, aspectos a mejorar y recomendaciones accionables. " +
      "Acompañá la tarjeta de análisis con un breve diagnóstico editorial en tu mensaje de texto. No uses propose_edit.",
    );
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col" style={HEADER_HEIGHT_VAR}>
      <EditorTopBar
        status={status}
        saveState={saveState}
        previewing={previewing}
        canPublish={canPublish}
        contentLength={content.length}
        onTogglePreview={() => setPreviewing((current) => !current)}
        onContinue={() => setPublishOpen(true)}
        aiOpen={aiOpen}
        aiShortcut={aiShortcut}
        onToggleAi={() => setDrawer(!aiOpen)}
      />

      <div className="flex flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {!previewing && (
            <EditorToolbar
              editor={editor}
              uploadingImage={images.uploading}
              onPickImages={(files) => images.insertFiles(files)}
            />
          )}

          <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col px-4 pt-8 pb-24">
            {status === "rejected" && rejectionReason && (
              <p role="alert" className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                Rechazado: {rejectionReason}
              </p>
            )}

            {images.uploading && (
              <p role="status" className="mb-4 text-sm text-muted-foreground">
                Subiendo imagen…
              </p>
            )}
            {images.error && (
              <p
                role="alert"
                className="mb-4 flex items-center justify-between gap-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                {images.error}
                <Button type="button" size="sm" variant="ghost" onClick={images.dismissError}>
                  Cerrar
                </Button>
              </p>
            )}

            {previewing ? (
              <>
                <h1 className="text-3xl leading-tight font-semibold text-foreground [overflow-wrap:anywhere]">
                  {title.trim() || "Sin título"}
                </h1>
                <MarkdownContent className="mt-6">{content}</MarkdownContent>
              </>
            ) : (
              <textarea
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  update({ title: event.target.value });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    editor?.commands.focus("start");
                  }
                }}
                rows={1}
                maxLength={POST_TITLE_MAX_LENGTH}
                placeholder="Título"
                aria-label="Título"
                className="mb-6 w-full resize-none bg-transparent text-3xl leading-tight font-semibold text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/60"
              />
            )}

            <div hidden={previewing}>
              <EditorContent editor={editor} />
            </div>
          </main>
        </div>

        <AiChatDrawer
          ref={drawerRef}
          open={aiOpen}
          onClose={() => setDrawer(false)}
          chat={chat}
          busy={ai.busy}
          onInsertToEditor={insertMarkdown}
          canInsertAtCursor={hasCursor && !previewing}
          quickActions={
            <QuickActions
              busy={ai.busy}
              disabled={previewing || !editor}
              onOutline={handleOutlineTool}
              onTitles={handleTitlesTool}
              onTone={handleToneTool}
              onScore={handleScoreTool}
            />
          }
          welcomeGrid={
            <QuickActionsGrid
              busy={ai.busy}
              disabled={previewing || !editor}
              onOutline={handleOutlineTool}
              onTitles={handleTitlesTool}
              onTone={handleToneTool}
              onScore={handleScoreTool}
            />
          }
        />
      </div>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        canPublish={canPublish}
        initialCover={initialCover}
        tags={tags}
        onTagsChange={setTags}
        allTagNames={allTagNames}
        ensurePostId={persist}
        getContent={getContent}
        onPublished={(publishedId) => router.push(`/post/${publishedId}`)}
        onPublishedStatus={() => {
          setStatus("published");
          setRejectionReason(null);
        }}
        onRejected={(reason) => {
          setStatus("rejected");
          setRejectionReason(reason);
          setPublishOpen(false);
        }}
      />
    </div>
  );
}
