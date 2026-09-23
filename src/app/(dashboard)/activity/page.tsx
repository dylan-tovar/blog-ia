import { Bell } from "lucide-react";
import { redirect } from "next/navigation";
import { NotificationList } from "@/features/notifications/components/NotificationList";
import { markAllNotificationsRead } from "@/features/notifications/actions";
import { getNotificationsPage } from "@/features/notifications/queries";
import { getViewer } from "@/lib/viewer";

export default async function ActivityPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/login");
  }

  // Se lee primero (con el `read_at` que tenía antes de esta visita, para
  // distinguir qué era nuevo) y recién después se marca todo como leído: así
  // el badge baja a 0 apenas se entra, pero la lista renderizada sigue
  // mostrando el estado "no leída" de esta visita.
  const { notifications, hasMore } = await getNotificationsPage(viewer.id, 0);
  await markAllNotificationsRead();

  return (
    <div className="mx-auto w-full max-w-xl">
      {/* Desktop page header */}
      <div className="hidden md:flex items-center justify-between border-b px-4 py-5">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Actividad</h1>
      </div>

      <h1 className="sr-only md:hidden">Actividad</h1>

      {notifications.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
          <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary shadow-xs">
            <Bell className="size-7" aria-hidden />
          </div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            No tenés actividad reciente
          </h2>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground leading-relaxed">
            Cuando otros usuarios le den me gusta a tus publicaciones, dejen notas o te sigan, lo
            verás acá.
          </p>
        </div>
      ) : (
        <NotificationList initialNotifications={notifications} initialHasMore={hasMore} />
      )}
    </div>
  );
}
