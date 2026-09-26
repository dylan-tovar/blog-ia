"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ellipsis, Link2, Share2, SquarePen, Users } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { FollowButton } from "@/features/subscriptions/components/FollowButton";
import { SubscribersModal } from "@/features/subscriptions/components/SubscribersModal";
import type { Subscriber } from "@/features/subscriptions/queries";
import { PostCard } from "@/features/posts/components/PostCard";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { CreatePostMenu } from "@/features/posts/components/CreatePostMenu";
import { NoteTriggerBar } from "@/features/posts/components/NoteTriggerBar";
import type { FeedPost } from "@/features/posts/queries";
import { cn } from "@/lib/utils";

interface AuthorProfileViewProps {
  profile: {
    id: string;
    display_name: string;
    username: string;
    avatar_url?: string | null;
  };
  viewer: {
    id: string;
    displayName: string | null;
  } | null;
  posts: FeedPost[];
  likedPosts?: FeedPost[];
  followerCount: number;
  following: boolean;
  subscribers?: Subscriber[];
  subscriptions?: Subscriber[];
}

const TABS = [
  { id: "activity", label: "Actividad" },
  { id: "posts", label: "Posts" },
  { id: "replies", label: "Respuestas" },
  { id: "likes", label: "Likes" },
  { id: "subscriptions", label: "Suscripciones" },
] as const;

export function AuthorProfileView({
  profile,
  viewer,
  posts,
  likedPosts = [],
  followerCount,
  following,
  subscribers = [],
  subscriptions = [],
}: AuthorProfileViewProps) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("activity");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwnProfile = viewer?.id === profile.id;

  const activeIndex = useMemo(
    () => Math.max(0, TABS.findIndex((tab) => tab.id === activeTab)),
    [activeTab],
  );

  const displayedPosts = useMemo(() => {
    if (activeTab === "posts") {
      return posts.filter((p) => p.type === "article" || !p.parent);
    }
    if (activeTab === "replies") {
      return posts.filter((p) => p.type === "note" && p.parent !== null);
    }
    if (activeTab === "likes") {
      return likedPosts;
    }
    if (activeTab === "activity") {
      return posts;
    }
    return [];
  }, [activeTab, posts, likedPosts]);

  async function handleCopyLink() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (url && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOptionsOpen(false);
      }, 1000);
    } else {
      setOptionsOpen(false);
    }
  }

  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: profile.display_name,
          url,
        });
      } catch {
        // Ignored if cancelled
      }
    } else if (url && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
    }
    setOptionsOpen(false);
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* PROFILE HEADER */}
      <section className="px-4 pt-6 pb-2">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {profile.display_name}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground sm:text-base">
              @{profile.username}
            </p>

            {/* Subscribers */}
            <div className="mt-3">
              <SubscribersModal
                authorName={profile.display_name}
                subscribers={subscribers}
                viewerId={viewer?.id ?? null}
                trigger={
                  <button
                    type="button"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer"
                  >
                    {followerCount === 0
                      ? "Ver suscriptores"
                      : `${followerCount} ${followerCount === 1 ? "suscriptor" : "suscriptores"}`}
                  </button>
                }
              />
            </div>
          </div>

          {/* Large Avatar */}
          <UserAvatar
            name={profile.display_name}
            avatarUrl={profile.avatar_url}
            className="size-20 shrink-0 text-2xl font-bold ring-1 ring-border/50 sm:size-24 sm:text-3xl"
          />
        </div>

        {/* ACTION BUTTONS */}
        <div className="mt-6 flex items-center gap-2.5">
          {isOwnProfile ? (
            <>
              <CreatePostMenu
                viewerName={viewer?.displayName ?? null}
                className="flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-blue-500"
              >
                <SquarePen className="size-4" aria-hidden />
                Crear
              </CreatePostMenu>

              <Link
                href="/settings"
                className="flex flex-1 items-center justify-center rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-neutral-700"
              >
                Editar perfil
              </Link>

              <Drawer open={optionsOpen} onOpenChange={setOptionsOpen} showSwipeHandle>
                <DrawerTrigger
                  type="button"
                  aria-label="More options"
                  className="grid size-9 place-items-center rounded-md bg-neutral-800 text-foreground transition-colors hover:bg-neutral-700 cursor-pointer shrink-0"
                >
                  <Ellipsis className="size-5" />
                </DrawerTrigger>

                <DrawerContent className="mx-2 mb-2 max-w-lg pb-4 pt-1 sm:mx-auto [--drawer-inset:0.5rem] data-[swipe-direction=down]:rounded-2xl data-[swipe-direction=down]:border border-border/80 shadow-2xl after:hidden">
                  <DrawerHeader className="sr-only">
                    <DrawerTitle>Opciones del perfil</DrawerTitle>
                    <DrawerDescription>Compartir o copiar enlace del perfil</DrawerDescription>
                  </DrawerHeader>

                  <div className="flex flex-col px-1.5 py-2 text-foreground">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex w-full items-center gap-4 rounded-md px-5 py-3 text-sm font-normal transition-colors hover:bg-muted/70 cursor-pointer"
                    >
                      <Link2 className="size-4.5 shrink-0" />
                      <span>{copied ? "Enlace copiado" : "Copiar link del perfil"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleShare}
                      className="flex w-full items-center gap-4 rounded-md px-5 py-3 text-sm font-normal transition-colors hover:bg-muted/70 cursor-pointer"
                    >
                      <Share2 className="size-4.5 shrink-0" />
                      <span>Compartir</span>
                    </button>
                  </div>
                </DrawerContent>
              </Drawer>
            </>
          ) : (
            <div className="flex-1">
              <FollowButton authorId={profile.id} initialFollowing={following} />
            </div>
          )}
        </div>
      </section>

      {/* TABS */}
      <div className="relative mt-2 border-b border-border/60">
        <div role="tablist" aria-label="Secciones del perfil" className="flex w-full">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex-1 cursor-pointer py-3.5 px-1 text-center text-xs sm:text-sm whitespace-nowrap transition-colors",
                  isActive
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Sliding active indicator */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-[2px] w-1/5 bg-foreground transition-transform duration-300 ease-out"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
      </div>

      {/* TAB CONTENT WITH SMOOTH TRANSITION */}
      <div key={activeTab} className="flex flex-col animate-in fade-in-50 duration-200">
        {/* COMPOSER BAR (Own profile on Activity/Posts tabs) */}
        {isOwnProfile && (activeTab === "activity" || activeTab === "posts") && (
          <section aria-label="Nueva nota" className="px-4 md:px-0 pt-4 pb-3">
            <NoteTriggerBar viewerName={viewer?.displayName ?? null} />
          </section>
        )}

        {/* TAB CONTENT */}
        {activeTab === "activity" || activeTab === "posts" || activeTab === "replies" || activeTab === "likes" ? (
          displayedPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-neutral-800/60 text-muted-foreground">
                <SquarePen className="size-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {activeTab === "replies"
                  ? isOwnProfile
                    ? "Todavía no respondiste a ninguna publicación."
                    : "Todavía no hay respuestas."
                  : activeTab === "likes"
                    ? isOwnProfile
                      ? "Todavía no le diste me gusta a ninguna publicación."
                      : "Todavía no hay me gusta."
                    : isOwnProfile
                      ? "Todavía no publicaste nada."
                      : "Todavía no hay publicaciones."}
              </h3>
              {isOwnProfile && activeTab !== "replies" && activeTab !== "likes" && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Empezá escribiendo una nota.
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {displayedPosts.map((post) => (
                <PostCard key={post.id} post={post} viewerId={viewer?.id ?? null} />
              ))}
            </div>
          )
        ) : activeTab === "subscriptions" ? (
          subscriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
              <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-neutral-800/60 text-muted-foreground">
                <Users className="size-6" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {isOwnProfile
                  ? "Todavía no te suscribiste a ningún autor."
                  : "Todavía no sigue a ningún autor."}
              </h3>
              {isOwnProfile && (
                <Link
                  href="/explore"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Explorar autores para seguir
                </Link>
              )}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/40 px-4">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-3 py-3.5"
                >
                  <Link
                    href={`/${sub.username}`}
                    className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-85"
                  >
                    <UserAvatar name={sub.displayName} className="size-11 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground hover:underline">
                        {sub.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        @{sub.username}
                      </span>
                    </div>
                  </Link>

                  {viewer?.id !== sub.id && (
                    <FollowButton
                      authorId={sub.id}
                      initialFollowing={sub.isFollowing}
                      variant="compact"
                    />
                  )}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="px-4 py-16 text-center text-sm text-muted-foreground">
            No {activeTab} yet.
          </div>
        )}
      </div>
    </div>
  );
}
