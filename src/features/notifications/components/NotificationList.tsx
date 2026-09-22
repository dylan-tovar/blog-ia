"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import { loadMoreNotifications } from "@/features/notifications/actions";
import type { Notification } from "@/features/notifications/queries";

interface NotificationListProps {
  initialNotifications: Notification[];
  initialHasMore: boolean;
}

export function NotificationList({
  initialNotifications,
  initialHasMore,
}: NotificationListProps) {
  // La primera página siempre viene de props (así una notificación nueva
  // aparece apenas se revalida); solo las páginas de "Cargar más" viven en
  // estado de cliente. Mismo patrón que FeedList.
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

  return (
    <div className="flex flex-col">
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
      {hasMore && (
        <div className="p-4">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={handleLoadMore}
            className="min-h-11 w-full"
          >
            {isPending && <Loader2 className="animate-spin" />}
            Cargar más
          </Button>
        </div>
      )}
    </div>
  );
}
