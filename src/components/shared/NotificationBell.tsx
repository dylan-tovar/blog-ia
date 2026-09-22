"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell } from "lucide-react";
import { getUnreadCount } from "@/features/notifications/actions";

// Sin Realtime en el proyecto: el badge se refresca por polling liviano. La
// lista en sí se actualiza por `revalidatePath` como el resto del feed.
const POLL_INTERVAL_MS = 45_000;

export function NotificationBell({
  initialCount,
  className,
}: {
  initialCount: number;
  className?: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const interval = setInterval(() => {
      startTransition(async () => {
        const next = await getUnreadCount();
        setCount(next);
      });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="relative inline-flex">
      <Bell className={className} aria-hidden />
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] leading-none font-semibold text-primary-foreground"
          aria-label={`${count} notificaciones sin leer`}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </span>
  );
}
