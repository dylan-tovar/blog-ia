"use client";

import { Bell } from "lucide-react";
import { useNotificationsRealtime } from "@/features/notifications/realtime/NotificationsRealtimeProvider";

// Presentacional: el contador viene del canal Realtime único compartido por
// las 3 instancias (MainNav/DesktopSidebar/BottomNav), con polling de 45s
// como fallback siempre activo. Ver NotificationsRealtimeProvider.
export function NotificationBell({ className }: { className?: string }) {
  const { unreadCount } = useNotificationsRealtime();

  return (
    <span className="relative inline-flex">
      <Bell className={className} aria-hidden />
      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] leading-none font-semibold text-primary-foreground"
          aria-label={`${unreadCount} notificaciones sin leer`}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </span>
  );
}
