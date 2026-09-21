"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Ellipsis, Link2, Share2, SquarePen } from "lucide-react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { FollowButton } from "@/features/subscriptions/components/FollowButton";
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
}

const TABS = [
  { id: "activity", label: "Activity" },
  { id: "posts", label: "Posts" },
  { id: "replies", label: "Replies" },
  { id: "likes", label: "Likes" },
  { id: "subscriptions", label: "Subscriptions" },
] as const;

export function AuthorProfileView({
  profile,
  viewer,
  posts,
  likedPosts = [],
  followerCount,
  following,
}: AuthorProfileViewProps) {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>("activity");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwnProfile = viewer?.id === profile.id;

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
    <div className="mx-auto w-full max-w-2xl">
      {/* PROFILE HEADER */}
      <section className="px-4 pt-6 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
              {profile.display_name}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              @{profile.username}
            </p>

            {/* Pill badge */}
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-neutral-800/80 px-2.5 py-1 text-xs font-medium text-foreground">
              <UserAvatar name={profile.display_name} className="size-4 text-[9px]" />
              <span className="max-w-[160px] truncate">{profile.display_name}</span>
            </div>

            {/* Subscribers */}
            <div className="mt-3">
              <span className="text-sm text-muted-foreground transition-colors hover:text-foreground cursor-pointer">
                {followerCount === 0
                  ? "See subscribers"
                  : `${followerCount} ${followerCount === 1 ? "subscriber" : "subscribers"}`}
              </span>
            </div>
          </div>

          {/* Large Avatar */}
          <UserAvatar
            name={profile.display_name}
            className="size-18 text-2xl font-bold ring-1 ring-border/50 shrink-0"
          />
        </div>

        {/* ACTION BUTTONS */}
        <div className="mt-5 flex items-center gap-2">
          {isOwnProfile ? (
            <>
              <CreatePostMenu
                viewerName={viewer?.displayName ?? null}
                className="flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-neutral-700"
              >
                <SquarePen className="size-4" aria-hidden />
                Crear
              </CreatePostMenu>

              <Link
                href="/settings"
                className="flex flex-1 items-center justify-center rounded-md bg-neutral-800 px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-neutral-700"
              >
                Edit profile
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
      <div className="mt-3 border-b border-border/60">
        <div className="flex gap-6 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative cursor-pointer py-3 text-sm whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "font-semibold text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* COMPOSER BAR (Own profile on Activity/Posts tabs) */}
      {isOwnProfile && (activeTab === "activity" || activeTab === "posts") && (
        <section aria-label="Nueva nota" className="border-b border-border/40 px-4 py-2">
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
              <PostCard key={post.id} post={post} viewerId={viewer?.id} />
            ))}
          </div>
        )
      ) : (
        <div className="px-4 py-16 text-center text-sm text-muted-foreground">
          No {activeTab} yet.
        </div>
      )}
    </div>
  );
}
