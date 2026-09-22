import type { Notification } from "@/features/notifications/queries";

// Pure so it's testable without hitting Supabase: text/link only depend on the
// notification shape.
export function describeNotification(notification: Notification): {
  actionText: string;
  href: string;
} {
  switch (notification.type) {
    case "follow":
      return {
        actionText: "empezó a seguirte",
        href: notification.actor ? `/author/${notification.actor.id}` : "/activity",
      };
    case "like":
      return {
        actionText: "le dio me gusta a tu post",
        href: notification.postId ? `/post/${notification.postId}` : "/activity",
      };
    case "note":
      return {
        actionText: "dejó una nota en tu post",
        href: notification.postId ? `/post/${notification.postId}` : "/activity",
      };
  }
}
