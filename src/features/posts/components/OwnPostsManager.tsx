"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  BookOpen,
  Copy,
  Check,
  ExternalLink,
  MoreHorizontal,
  PenLine,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PostStatusBadge } from "@/features/posts/components/PostStatusBadge";
import { deletePost } from "@/features/posts/actions";
import type { OwnPostItem } from "@/features/posts/queries";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "published" | "draft";

interface OwnPostsManagerProps {
  initialPosts: OwnPostItem[];
}

export function OwnPostsManager({ initialPosts }: OwnPostsManagerProps) {
  const [posts, setPosts] = useState<OwnPostItem[]>(initialPosts);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [postToDelete, setPostToDelete] = useState<OwnPostItem | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const counts = useMemo(() => {
    return {
      all: posts.length,
      published: posts.filter((p) => p.status === "published").length,
      draft: posts.filter((p) => p.status === "draft").length,
    };
  }, [posts]);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (filter === "published" && post.status !== "published") return false;
      if (filter === "draft" && post.status !== "draft") return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const titleMatch = (post.title ?? "").toLowerCase().includes(query);
        const excerptMatch = post.excerpt.toLowerCase().includes(query);
        return titleMatch || excerptMatch;
      }
      return true;
    });
  }, [posts, filter, searchQuery]);

  async function handleCopyLink(postId: string) {
    try {
      const url = `${window.location.origin}/post/${postId}`;
      await navigator.clipboard.writeText(url);
      setCopiedId(postId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Fallback if clipboard API is restricted
    }
  }

  function handleDeleteConfirm() {
    if (!postToDelete) return;
    const targetId = postToDelete.id;

    startDeleteTransition(async () => {
      const result = await deletePost(targetId);
      if (result.ok) {
        setPosts((current) => current.filter((p) => p.id !== targetId));
        setPostToDelete(null);
      }
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Publicaciones
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {posts.length === 1
              ? "1 artículo en tu cuenta"
              : `${posts.length} artículos en tu cuenta`}
            {counts.draft > 0 && ` • ${counts.draft} en borrador`}
          </p>
        </div>

        <Link
          href="/editor/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
        >
          <Plus className="size-4" />
          <span>Nuevo artículo</span>
        </Link>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              filter === "all"
                ? "bg-foreground text-background shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Todos ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setFilter("published")}
            className={cn(
              "shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              filter === "published"
                ? "bg-foreground text-background shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Publicados ({counts.published})
          </button>
          <button
            type="button"
            onClick={() => setFilter("draft")}
            className={cn(
              "shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
              filter === "draft"
                ? "bg-foreground text-background shadow-xs"
                : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            Borradores ({counts.draft})
          </button>
        </div>

        {posts.length > 2 && (
          <div className="relative w-full sm:w-60">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por título..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-border/70 bg-muted/30 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
          </div>
        )}
      </div>

      {/* Posts List */}
      <div className="mt-6 flex flex-col gap-3">
        {filteredPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 px-4 py-16 text-center">
            <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-muted/80 text-muted-foreground">
              <BookOpen className="size-6" />
            </div>
            <h2 className="text-base font-semibold text-foreground">
              {searchQuery
                ? "No se encontraron publicaciones"
                : filter === "draft"
                  ? "No tenés borradores pendientes"
                  : filter === "published"
                    ? "Todavía no publicaste ningún artículo"
                    : "No hay publicaciones"}
            </h2>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {searchQuery
                ? "Probá con otra palabra clave en el buscador."
                : filter === "draft"
                  ? "Las ideas que empieces a escribir aparecerán acá automáticamente."
                  : "Compartí tu conocimiento e ideas con la comunidad."}
            </p>
            {filter !== "draft" && !searchQuery && (
              <Link
                href="/editor/new"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <Plus className="size-3.5" />
                Empezar a escribir
              </Link>
            )}
          </div>
        ) : (
          filteredPosts.map((post) => {
            const isPublished = post.status === "published";
            const isCopied = copiedId === post.id;
            const primaryHref = isPublished ? `/post/${post.id}` : `/editor/${post.id}`;

            return (
              <article
                key={post.id}
                className="group relative flex flex-col justify-between gap-3 rounded-2xl border border-border/60 bg-card/50 p-4 transition-all hover:border-border hover:bg-card/90 sm:p-5"
              >
                {/* Top Meta Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <PostStatusBadge status={post.status} />
                    <span aria-hidden>•</span>
                    <time dateTime={post.updated_at} suppressHydrationWarning>
                      {isPublished && post.published_at
                        ? `Publicado el ${formatShortDate(post.published_at)}`
                        : `Actualizado el ${formatShortDate(post.updated_at)}`}
                    </time>
                    {post.wordCount > 0 && (
                      <>
                        <span aria-hidden>•</span>
                        <span>{post.readingTimeMinutes} min de lectura</span>
                      </>
                    )}
                  </div>

                  {/* Contextual Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="Más opciones"
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-xs font-medium"
                        render={<Link href={`/editor/${post.id}`} />}
                      >
                        <PenLine className="size-3.5" />
                        <span>Editar artículo</span>
                      </DropdownMenuItem>

                      {isPublished && (
                        <>
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-xs font-medium"
                            render={<Link href={`/post/${post.id}`} />}
                          >
                            <ExternalLink className="size-3.5" />
                            <span>Ver artículo público</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer gap-2 text-xs font-medium"
                            onClick={() => handleCopyLink(post.id)}
                          >
                            {isCopied ? (
                              <Check className="size-3.5 text-green-400" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                            <span>{isCopied ? "Enlace copiado" : "Copiar enlace"}</span>
                          </DropdownMenuItem>
                        </>
                      )}

                      <DropdownMenuSeparator />

                      <DropdownMenuItem
                        className="cursor-pointer gap-2 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
                        onClick={() => setPostToDelete(post)}
                      >
                        <Trash2 className="size-3.5" />
                        <span>Eliminar {isPublished ? "artículo" : "borrador"}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Rejection notice if present */}
                {post.status === "rejected" && post.rejection_reason && (
                  <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <span className="font-semibold">Motivo del rechazo: </span>
                    {post.rejection_reason}
                  </div>
                )}

                {/* Main Content & Optional Cover Thumbnail */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Link href={primaryHref} className="block group-hover:underline">
                      <h2 className="text-base font-semibold leading-snug tracking-tight text-foreground sm:text-lg">
                        {post.title?.trim() || "Sin título"}
                      </h2>
                    </Link>
                    <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {post.excerpt || "Sin contenido todavía. Tocá editar para comenzar a escribir."}
                    </p>
                  </div>

                  {/* Cover preview */}
                  {post.cover.kind === "image" && (
                    <img
                      src={post.cover.url}
                      alt=""
                      className="size-16 sm:size-20 shrink-0 rounded-xl border border-border/40 object-cover bg-muted"
                      loading="lazy"
                    />
                  )}
                  {post.cover.kind === "text" && (
                    <div className="size-16 sm:size-20 shrink-0 rounded-xl border border-border/40 p-2 flex items-center justify-center font-serif text-[10px] italic text-center text-muted-foreground line-clamp-3 bg-muted/40">
                      &ldquo;{post.cover.text}&rdquo;
                    </div>
                  )}
                </div>

                {/* Action Footer */}
                <div className="mt-1 flex items-center gap-2 pt-2 border-t border-border/40">
                  <Link
                    href={`/editor/${post.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    <PenLine className="size-3.5" />
                    <span>Editar</span>
                  </Link>

                  {isPublished && (
                    <>
                      <Link
                        href={`/post/${post.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                        <span>Ver</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => handleCopyLink(post.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                      >
                        {isCopied ? (
                          <>
                            <Check className="size-3.5 text-green-400" />
                            <span className="text-green-400">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            <span>Copiar link</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Dialog open={Boolean(postToDelete)} onOpenChange={(open) => !open && setPostToDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              ¿Eliminar {postToDelete?.status === "published" ? "artículo" : "borrador"}?
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
              Esta acción no se puede deshacer. Se eliminará definitivamente &ldquo;
              {postToDelete?.title || "Sin título"}&rdquo; y todo su contenido asociado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPostToDelete(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? "Eliminando..." : "Sí, eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
