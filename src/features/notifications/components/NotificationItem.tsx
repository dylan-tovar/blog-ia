import Link from "next/link";
import { Heart, MessageCircle, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { formatRelativeDate } from "@/lib/format";
import { describeNotification } from "@/features/notifications/format";
import type { Notification } from "@/features/notifications/queries";

const TYPE_CONFIG = {
  follow: {
    icon: UserPlus,
    badgeBg: "bg-blue-500/15 text-blue-500 ring-2 ring-background",
  },
  like: {
    icon: Heart,
    badgeBg: "bg-rose-500/15 text-rose-500 ring-2 ring-background",
  },
  note: {
    icon: MessageCircle,
    badgeBg: "bg-emerald-500/15 text-emerald-500 ring-2 ring-background",
  },
} as const;

export function NotificationItem({ notification }: { notification: Notification }) {
  const { actionText, href } = describeNotification(notification);
  const config = TYPE_CONFIG[notification.type];
  const Icon = config.icon;
  const actorName = notification.actor?.displayName ?? "Alguien";
  const unread = !notification.readAt;

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-start gap-3.5 border-b border-border/40 px-4 py-3.5 transition-colors hover:bg-accent/40 active:bg-accent/60",
        unread && "bg-accent/20",
      )}
    >
      <div className="relative shrink-0 pt-0.5">
        <UserAvatar name={notification.actor?.displayName} size="default" className="size-10" />
        <span
          className={cn(
            "absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full shadow-xs",
            config.badgeBg,
          )}
        >
          <Icon className="size-2.5" aria-hidden />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[14px] text-foreground leading-snug">
            <span className="font-semibold group-hover:underline">{actorName}</span>{" "}
            <span className="text-foreground/80">{actionText}</span>
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {unread && (
              <span className="size-2 rounded-full bg-blue-500" aria-label="No leída" />
            )}
            <time
              dateTime={notification.createdAt}
              suppressHydrationWarning
              className="text-xs text-muted-foreground"
            >
              {formatRelativeDate(notification.createdAt)}
            </time>
          </div>
        </div>

        {notification.type === "note" && notification.noteExcerpt && (
          <div className="mt-2 rounded-xl border border-border/50 bg-muted/40 px-3.5 py-2 text-[13px] text-muted-foreground line-clamp-3">
            “{notification.noteExcerpt}”
          </div>
        )}
      </div>
    </Link>
  );
}
