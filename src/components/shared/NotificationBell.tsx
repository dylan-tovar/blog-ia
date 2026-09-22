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
  pollQuery,
}: {
  initialCount: number;
  className?: string;
  // BottomNav y MainNav están siempre montados (solo se ocultan por CSS en el
  // breakpoint contrario), así que sin esto ambas instancias harían polling en
  // paralelo por la misma badge, siempre invisible en algún lado. Solo la
  // instancia cuyo `pollQuery` matchea hace polling.
  pollQuery: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const media = window.matchMedia(pollQuery);
    let interval: ReturnType<typeof setInterval> | null = null;

    function sync() {
      if (media.matches && !interval) {
        interval = setInterval(() => {
          startTransition(async () => {
            setCount(await getUnreadCount());
          });
        }, POLL_INTERVAL_MS);
      } else if (!media.matches && interval) {
        clearInterval(interval);
        interval = null;
      }
    }

    sync();
    media.addEventListener("change", sync);
    return () => {
      media.removeEventListener("change", sync);
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [pollQuery]);

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
