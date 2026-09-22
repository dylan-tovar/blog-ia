import Link from "next/link";
import { Heart, MessageCircle, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatRelativeDate } from "@/lib/format";
import { describeNotification } from "@/features/notifications/format";
import type { Notification } from "@/features/notifications/queries";

const ICONS = {
  follow: UserPlus,
  like: Heart,
  note: MessageCircle,
} as const;

export function NotificationItem({ notification }: { notification: Notification }) {
  const { actionText, href } = describeNotification(notification);
  const Icon = ICONS[notification.type];
  const actorName = notification.actor?.displayName ?? "Alguien";
  const unread = !notification.readAt;

  return (
    <Link
      href={href}
      className={cn(
        "flex items-start gap-3 border-b px-4 py-3 transition-colors hover:bg-accent/50",
        unread && "bg-accent/30",
      )}
    >
      <UserAvatar name={notification.actor?.displayName} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="font-semibold">{actorName}</span> {actionText}
        </p>
        {notification.type === "note" && notification.noteExcerpt && (
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            “{notification.noteExcerpt}”
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatRelativeDate(notification.createdAt)}
        </p>
      </div>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}
