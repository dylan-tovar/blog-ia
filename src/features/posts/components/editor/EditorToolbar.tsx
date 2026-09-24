"use client";

import { useRef, useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  ChevronDown,
  Code,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { IMAGE_ACCEPTED_TYPES } from "@/features/posts/images/image-limits";
import { cn } from "@/lib/utils";

type BlockStyle = "paragraph" | "h2" | "h3";

const BLOCK_STYLE_LABELS: Record<BlockStyle, string> = {
  paragraph: "Párrafo",
  h2: "Título",
  h3: "Subtítulo",
};

function ToolbarButton({
  label,
  active,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  // Only real toggles pass `active`; it is what turns on aria-pressed.
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function Divider() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

function normalizeUrl(raw: string) {
  const value = raw.trim();
  if (!value) {
    return "";
  }
  return /^(https?:\/\/|mailto:|\/|#)/i.test(value) ? value : `https://${value}`;
}

export function EditorToolbar({
  editor,
  uploadingImage,
  onPickImages,
}: {
  editor: Editor | null;
  uploadingImage: boolean;
  onPickImages: (files: File[]) => void;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) {
        return null;
      }

      const style: BlockStyle = current.isActive("heading", { level: 2 })
        ? "h2"
        : current.isActive("heading", { level: 3 })
          ? "h3"
          : "paragraph";

      return {
        style,
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        strike: current.isActive("strike"),
        code: current.isActive("code"),
        highlight: current.isActive("highlight"),
        link: current.isActive("link"),
        bulletList: current.isActive("bulletList"),
        orderedList: current.isActive("orderedList"),
        blockquote: current.isActive("blockquote"),
        codeBlock: current.isActive("codeBlock"),
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
      };
    },
  });

  if (!editor || !state) {
    return <div className="h-12 border-b border-border/60" aria-hidden />;
  }

  function setBlockStyle(style: BlockStyle) {
    const chain = editor!.chain().focus();
    if (style === "paragraph") {
      chain.setParagraph().run();
    } else {
      chain.setHeading({ level: style === "h2" ? 2 : 3 }).run();
    }
  }

  function openLink() {
    setHref(editor!.getAttributes("link").href ?? "");
    setLinkOpen(true);
  }

  function applyLink() {
    const url = normalizeUrl(href);
    if (url) {
      editor!.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
    setLinkOpen(false);
  }

  function removeLink() {
    editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  }

  return (
    <div
      role="toolbar"
      aria-label="Formato del texto"
      className="flex h-11 items-center border-b border-border/60"
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-0.5 overflow-x-auto px-4">
        <ToolbarButton
          label="Deshacer"
          disabled={!state.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 />
        </ToolbarButton>
        <ToolbarButton
          label="Rehacer"
          disabled={!state.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 />
        </ToolbarButton>

        <Divider />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="sm" className="gap-1" />}
            aria-label="Estilo de bloque"
          >
            {BLOCK_STYLE_LABELS[state.style]}
            <ChevronDown aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            {(Object.keys(BLOCK_STYLE_LABELS) as BlockStyle[]).map((style) => (
              <DropdownMenuItem
                key={style}
                className={cn(state.style === style && "font-semibold")}
                onClick={() => setBlockStyle(style)}
              >
                {BLOCK_STYLE_LABELS[style]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Divider />

        <ToolbarButton
          label="Negrita"
          active={state.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold />
        </ToolbarButton>
        <ToolbarButton
          label="Cursiva"
          active={state.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic />
        </ToolbarButton>
        <ToolbarButton
          label="Tachado"
          active={state.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough />
        </ToolbarButton>
        <ToolbarButton
          label="Código en línea"
          active={state.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code />
        </ToolbarButton>
        <ToolbarButton
          label="Resaltado"
          active={state.highlight}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter />
        </ToolbarButton>
        <ToolbarButton label="Enlace" active={state.link || linkOpen} onClick={openLink}>
          <Link2 />
        </ToolbarButton>
        <ToolbarButton
          label={uploadingImage ? "Subiendo imagen…" : "Imagen"}
          disabled={uploadingImage}
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus />
        </ToolbarButton>
        <input
          ref={fileInput}
          type="file"
          accept={IMAGE_ACCEPTED_TYPES.join(",")}
          multiple
          hidden
          aria-hidden
          tabIndex={-1}
          onChange={(event) => {
            onPickImages(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />

        <Divider />

        <ToolbarButton
          label="Lista con viñetas"
          active={state.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List />
        </ToolbarButton>
        <ToolbarButton
          label="Lista numerada"
          active={state.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolbarButton>
        <ToolbarButton
          label="Cita"
          active={state.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote />
        </ToolbarButton>
        <ToolbarButton
          label="Bloque de código"
          active={state.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <SquareCode />
        </ToolbarButton>
        <ToolbarButton
          label="Separador"
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        >
          <Minus />
        </ToolbarButton>
      </div>

      {linkOpen && (
        <form
          className="mx-auto flex max-w-3xl items-center gap-2 px-4 pb-2"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <Input
            autoFocus
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="https://…"
            aria-label="Dirección del enlace"
            type="text"
            inputMode="url"
          />
          <Button type="submit" size="sm">
            Aplicar
          </Button>
          {state.link && (
            <Button type="button" size="sm" variant="secondary" onClick={removeLink}>
              Quitar
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
            Cancelar
          </Button>
        </form>
      )}
    </div>
  );
}
