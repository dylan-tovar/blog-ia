"use client";

import { useEffect, useRef, useState, useTransition, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Ban,
  Bookmark,
  Check,
  Ellipsis,
  EyeOff,
  Link2,
  Loader2,
  Pencil,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditNoteDialog } from "@/features/posts/components/EditNoteDialog";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import { deleteNote } from "@/features/posts/actions";
import { followAuthor, unfollowAuthor } from "@/features/subscriptions/actions";
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
  viewerId?: string | null;
  initialFollowing?: boolean;
  onFollowChange?: (following: boolean) => void;
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

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    textArea.remove();
    return successful;
  } catch {
    return false;
  }
}

export function PostOptionsDrawer({
  post,
  isOwn = false,
  canDelete = false,
  canEdit = false,
  onDeleted,
  onEdited,
  redirectOnDelete,
  viewerId,
  initialFollowing = false,
  onFollowChange,
}: PostOptionsDrawerProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, startDeleting] = useTransition();
  const [following, setFollowing] = useState(initialFollowing);
  const [isFollowingPending, startFollowTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync when the server value changes. Adjusting state during render avoids
  // the extra render an effect would cause.
  const [syncedInitialFollowing, setSyncedInitialFollowing] = useState(initialFollowing);
  if (initialFollowing !== syncedInitialFollowing) {
    setSyncedInitialFollowing(initialFollowing);
    setFollowing(initialFollowing);
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  function close() {
    setDrawerOpen(false);
    setDropdownOpen(false);
  }

  function resetTransientState() {
    setConfirmingDelete(false);
    setCopied(false);
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
    }
  }

  function handleDrawerOpenChange(next: boolean) {
    setDrawerOpen(next);
    if (!next) resetTransientState();
  }

  function handleDropdownOpenChange(next: boolean) {
    setDropdownOpen(next);
    if (!next) resetTransientState();
  }

  async function handleCopyLink() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/post/${post.id}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopied(false);
        close();
      }, 900);
    } else {
      close();
    }
  }

  function handleToggleFollow() {
    if (viewerId === null) {
      close();
      setLoginOpen(true);
      return;
    }

    const author = post.author;
    if (!author) return;

    const nextFollowing = !following;
    startFollowTransition(async () => {
      setFollowing(nextFollowing);
      onFollowChange?.(nextFollowing);
      close();
      const res = await (nextFollowing
        ? followAuthor(author.id)
        : unfollowAuthor(author.id));
      if (!res.ok) {
        setFollowing(!nextFollowing);
        onFollowChange?.(!nextFollowing);
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }

    startDeleting(async () => {
      const result = await deleteNote(post.id);
      if (result.ok) {
        close();
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
      {/* Mobile Drawer */}
      <Drawer open={drawerOpen} onOpenChange={handleDrawerOpenChange} showSwipeHandle>
        <DrawerTrigger
          type="button"
          aria-label="Más opciones"
          className="grid size-5 place-items-center text-muted-foreground transition-colors hover:text-foreground cursor-pointer md:hidden"
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
                  <Option
                    icon={copied ? Check : Link2}
                    iconClassName={copied ? "text-emerald-500" : undefined}
                    label={copied ? "¡Enlace copiado!" : "Copiar enlace"}
                    onClick={handleCopyLink}
                  />
                  <Option icon={Bookmark} label="Guardar" onClick={close} />
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
                  <Option
                    icon={copied ? Check : Link2}
                    iconClassName={copied ? "text-emerald-500" : undefined}
                    label={copied ? "¡Enlace copiado!" : "Copiar enlace"}
                    onClick={handleCopyLink}
                  />
                  {post.author && viewerId !== post.author.id && (
                    <Option
                      icon={isFollowingPending ? Loader2 : following ? UserMinus : UserPlus}
                      iconClassName={isFollowingPending ? "animate-spin" : undefined}
                      label={following ? "Dejar de seguir" : "Seguir"}
                      onClick={handleToggleFollow}
                      disabled={isFollowingPending}
                    />
                  )}
                  <Option icon={Bookmark} label="Guardar" onClick={close} />
                </div>

                <div className="my-1 border-t border-border/80" />

                <div className="flex flex-col">
                  <Option icon={EyeOff} label="Ocultar publicación" onClick={close} />
                </div>

                <div className="my-1 border-t border-border/80" />

                <div className="flex flex-col">
                  <Option icon={Ban} label="Bloquear" onClick={close} destructive />
                  <Option icon={AlertCircle} label="Reportar" onClick={close} destructive />
                </div>
              </>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Desktop Dropdown */}
      <DropdownMenu open={dropdownOpen} onOpenChange={handleDropdownOpenChange}>
        <DropdownMenuTrigger
          type="button"
          aria-label="Más opciones"
          className="hidden size-5 place-items-center text-muted-foreground transition-colors hover:text-foreground cursor-pointer md:grid"
        >
          <Ellipsis className="size-4" aria-hidden />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-52 p-1.5 shadow-xl">
          {isOwn ? (
            <>
              {canEdit && post.type === "note" && (
                <DropdownMenuItem
                  className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal"
                  onClick={() => {
                    close();
                    setEditOpen(true);
                  }}
                >
                  <Pencil className="size-4 text-muted-foreground" />
                  <span>Editar nota</span>
                </DropdownMenuItem>
              )}
              {canEdit && post.type === "article" && (
                <DropdownMenuItem
                  className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal"
                  onClick={() => {
                    close();
                    router.push(`/editor/${post.id}`);
                  }}
                >
                  <Pencil className="size-4 text-muted-foreground" />
                  <span>Editar artículo</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                closeOnClick={false}
                className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <Link2 className="size-4 text-muted-foreground" />
                )}
                <span>{copied ? "¡Enlace copiado!" : "Copiar enlace"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal"
                onClick={close}
              >
                <Bookmark className="size-4 text-muted-foreground" />
                <span>Guardar</span>
              </DropdownMenuItem>

              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    closeOnClick={confirmingDelete}
                    className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal text-destructive focus:text-destructive"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="size-4 animate-spin text-destructive" />
                    ) : (
                      <Trash2 className="size-4 text-destructive" />
                    )}
                    <span>{confirmingDelete ? "Clic de nuevo para eliminar" : "Eliminar nota"}</span>
                  </DropdownMenuItem>
                </>
              )}
            </>
          ) : (
            <>
              <DropdownMenuItem
                closeOnClick={false}
                className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal"
                onClick={handleCopyLink}
              >
                {copied ? (
                  <Check className="size-4 text-emerald-500" />
                ) : (
                  <Link2 className="size-4 text-muted-foreground" />
                )}
                <span>{copied ? "¡Enlace copiado!" : "Copiar enlace"}</span>
              </DropdownMenuItem>
              {post.author && viewerId !== post.author.id && (
                <DropdownMenuItem
                  className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal"
                  onClick={handleToggleFollow}
                  disabled={isFollowingPending}
                >
                  {isFollowingPending ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : following ? (
                    <UserMinus className="size-4 text-muted-foreground" />
                  ) : (
                    <UserPlus className="size-4 text-muted-foreground" />
                  )}
                  <span>{following ? "Dejar de seguir" : "Seguir"}</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal"
                onClick={close}
              >
                <Bookmark className="size-4 text-muted-foreground" />
                <span>Guardar</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal"
                onClick={close}
              >
                <EyeOff className="size-4 text-muted-foreground" />
                <span>Ocultar publicación</span>
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal text-destructive focus:text-destructive"
                onClick={close}
              >
                <Ban className="size-4 text-destructive" />
                <span>Bloquear</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                className="cursor-pointer gap-2.5 py-2 px-2.5 font-normal text-destructive focus:text-destructive"
                onClick={close}
              >
                <AlertCircle className="size-4 text-destructive" />
                <span>Reportar</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

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

      {viewerId === null && (
        <LoginDrawer trigger={null} open={loginOpen} onOpenChange={setLoginOpen} />
      )}
    </>
  );
}
