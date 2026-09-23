"use client";

import { useMemo, useState, useTransition } from "react";
import { Heart, Loader2, MessageCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import { loadMoreNotifications } from "@/features/notifications/actions";
import type { Notification } from "@/features/notifications/queries";
import { cn } from "@/lib/utils";

interface NotificationListProps {
  initialNotifications: Notification[];
  initialHasMore: boolean;
}

type FilterType = "all" | "note" | "like" | "follow";

export function NotificationList({
  initialNotifications,
  initialHasMore,
}: NotificationListProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [more, setMore] = useState<{
    notifications: Notification[];
    hasMore: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const firstPageIds = new Set(initialNotifications.map((notification) => notification.id));
  const notifications = [
    ...initialNotifications,
    ...(more?.notifications ?? []).filter((notification) => !firstPageIds.has(notification.id)),
  ];
  const hasMore = more ? more.hasMore : initialHasMore;

  const counts = useMemo(() => {
    return {
      note: notifications.filter((n) => n.type === "note").length,
      like: notifications.filter((n) => n.type === "like").length,
      follow: notifications.filter((n) => n.type === "follow").length,
    };
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    if (filter === "all") return notifications;
    return notifications.filter((n) => n.type === filter);
  }, [notifications, filter]);

  function handleLoadMore() {
    startTransition(async () => {
      const offset = initialNotifications.length + (more?.notifications.length ?? 0);
      const page = await loadMoreNotifications(offset);
      setMore((current) => ({
        notifications: [...(current?.notifications ?? []), ...page.notifications],
        hasMore: page.hasMore,
      }));
    });
  }

  const emptyFilterConfig = {
    note: {
      icon: MessageCircle,
      text: "No tenés respuestas o notas recientes.",
    },
    like: {
      icon: Heart,
      text: "No tenés me gusta recientes.",
    },
    follow: {
      icon: UserPlus,
      text: "No tenés nuevos seguidores recientes.",
    },
    all: {
      icon: MessageCircle,
      text: "No tenés notificaciones.",
    },
  }[filter];

  return (
    <div className="flex flex-col">
      {/* Category filter tabs */}
      <div className="flex items-center gap-1.5 border-b px-4 py-2.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
            filter === "all"
              ? "bg-foreground text-background shadow-xs"
              : "bg-neutral-800/80 text-muted-foreground hover:bg-neutral-700 hover:text-foreground",
          )}
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => setFilter("note")}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
            filter === "note"
              ? "bg-foreground text-background shadow-xs"
              : "bg-neutral-800/80 text-muted-foreground hover:bg-neutral-700 hover:text-foreground",
          )}
        >
          Notas {counts.note > 0 && `(${counts.note})`}
        </button>
        <button
          type="button"
          onClick={() => setFilter("like")}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
            filter === "like"
              ? "bg-foreground text-background shadow-xs"
              : "bg-neutral-800/80 text-muted-foreground hover:bg-neutral-700 hover:text-foreground",
          )}
        >
          Me gusta {counts.like > 0 && `(${counts.like})`}
        </button>
        <button
          type="button"
          onClick={() => setFilter("follow")}
          className={cn(
            "shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
            filter === "follow"
              ? "bg-foreground text-background shadow-xs"
              : "bg-neutral-800/80 text-muted-foreground hover:bg-neutral-700 hover:text-foreground",
          )}
        >
          Seguidores {counts.follow > 0 && `(${counts.follow})`}
        </button>
      </div>

      {/* List or filtered empty state */}
      {filteredNotifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <div className="mb-3 grid size-10 place-items-center rounded-xl bg-neutral-800/60 text-muted-foreground">
            <emptyFilterConfig.icon className="size-5" aria-hidden />
          </div>
          <p className="text-sm font-medium text-muted-foreground">{emptyFilterConfig.text}</p>
        </div>
      ) : (
        filteredNotifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))
      )}

      {hasMore && filter === "all" && (
        <div className="p-4">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={handleLoadMore}
            className="min-h-11 w-full cursor-pointer font-medium"
          >
            {isPending && <Loader2 className="animate-spin" />}
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
