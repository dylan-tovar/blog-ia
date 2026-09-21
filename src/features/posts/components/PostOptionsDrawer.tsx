"use client";

import { useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Ban,
  Bookmark,
  Bot,
  Download,
  Ellipsis,
  EyeOff,
  Link2,
  Loader2,
  Pencil,
  Trash2,
  UserPlus,
  VolumeX,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { EditNoteDialog } from "@/features/posts/components/EditNoteDialog";
import { deleteNote } from "@/features/posts/actions";
import { cn } from "@/lib/utils";

interface PostOptionsDrawerProps {
  post: {
    id: string;
    type: "note" | "article";
    title?: string | null;
    content?: string;
    author?: { id: string; display_name: string } | null;
  };
  isOwn?: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  onDeleted?: (postId: string) => void;
  onEdited?: (newContent: string) => void;
  redirectOnDelete?: string;
}

interface OptionProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
  iconClassName?: string;
}

function Option({ icon: Icon, label, onClick, destructive, disabled, iconClassName }: OptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-4 rounded-md px-5 py-3 text-sm font-normal transition-colors hover:bg-muted/70 cursor-pointer disabled:cursor-default disabled:opacity-60",
        destructive && "text-red-500",
      )}
    >
      <Icon className={cn("size-4.5 shrink-0", iconClassName)} />
      <span>{label}</span>
    </button>
  );
}

export function PostOptionsDrawer({
  post,
  isOwn = false,
  canDelete = false,
  canEdit = false,
  onDeleted,
  onEdited,
  redirectOnDelete,
}: PostOptionsDrawerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, startDeleting] = useTransition();

  function close() {
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setConfirmingDelete(false);
    }
  }

  function handleCopyLink() {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`);
    }
    close();
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    startDeleting(async () => {
      const result = await deleteNote(post.id);
      if (result.ok) {
        handleOpenChange(false);
        if (redirectOnDelete) {
          router.push(redirectOnDelete);
        } else {
          router.refresh();
          onDeleted?.(post.id);
        }
      } else {
        setConfirmingDelete(false);
      }
    });
  }

  return (
    <>
      <Drawer open={open} onOpenChange={handleOpenChange} showSwipeHandle>
        <DrawerTrigger
          type="button"
          aria-label="Más opciones"
          className="grid size-5 place-items-center text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
        >
          <Ellipsis className="size-4" aria-hidden />
        </DrawerTrigger>

        <DrawerContent className="mx-2 sm:mx-auto sm:max-w-lg mb-2 pb-2 pt-1 [--drawer-inset:0.5rem] data-[swipe-direction=down]:rounded-2xl data-[swipe-direction=down]:border border-border/80 shadow-2xl after:hidden">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Opciones de la publicación</DrawerTitle>
            <DrawerDescription>
              Acciones disponibles para {(post.type === "article" && post.title) || "este post"}
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col px-1.5 py-1 text-foreground">
            {isOwn ? (
              <>
                <div className="flex flex-col">
                  {canEdit && post.type === "note" && (
                    <Option
                      icon={Pencil}
                      label="Editar nota"
                      onClick={() => {
                        close();
                        setEditOpen(true);
                      }}
                    />
                  )}
                  {canEdit && post.type === "article" && (
                    <Option
                      icon={Pencil}
                      label="Editar artículo"
                      onClick={() => {
                        close();
                        router.push(`/editor/${post.id}`);
                      }}
                    />
                  )}
                  <Option icon={Link2} label="Copiar enlace" onClick={handleCopyLink} />
                  <Option icon={Bookmark} label="Guardar" onClick={close} />
                  <Option icon={Download} label="Guardar como imagen" onClick={close} />
                </div>

                <div className="my-1 border-t border-border/80" />

                <div className="flex flex-col">
                  {canDelete && (
                    <Option
                      icon={isDeleting ? Loader2 : Trash2}
                      label={confirmingDelete ? "Tocá de nuevo para eliminar" : "Eliminar nota"}
                      onClick={handleDelete}
                      disabled={isDeleting}
                      iconClassName={isDeleting ? "animate-spin" : undefined}
                      destructive
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col">
                  <Option icon={Link2} label="Copiar enlace" onClick={handleCopyLink} />
                  <Option icon={UserPlus} label="Seguir" onClick={close} />
                  <Option icon={Bookmark} label="Guardar" onClick={close} />
                  <Option icon={Download} label="Guardar como imagen" onClick={close} />
                </div>

                <div className="my-1 border-t border-border/80" />

                <div className="flex flex-col">
                  <Option icon={Bot} label="Analizar texto con IA" onClick={close} />
                </div>

                <div className="my-1 border-t border-border/80" />

                <div className="flex flex-col">
                  <Option icon={EyeOff} label="Ocultar publicación" onClick={close} />
                </div>

                <div className="my-1 border-t border-border/80" />

                <div className="flex flex-col">
                  <Option icon={VolumeX} label="Silenciar" onClick={close} destructive />
                  <Option icon={Ban} label="Bloquear" onClick={close} destructive />
                  <Option icon={AlertCircle} label="Reportar" onClick={close} destructive />
                </div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {canEdit && post.type === "note" && (
        <EditNoteDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          postId={post.id}
          initialContent={post.content ?? ""}
          authorName={post.author?.display_name}
          onEdited={onEdited}
        />
      )}
    </>
  );
}
