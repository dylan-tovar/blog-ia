import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MainNav } from "@/components/shared/MainNav";
import { AccountDrawer } from "@/components/shared/AccountDrawer";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { getViewer } from "@/lib/viewer";

export async function HeaderAccount() {
  const viewer = await getViewer();

  if (!viewer) {
    return (
      <div className="flex items-center gap-1">
        <LoginDrawer />
        <Button className="hidden min-h-11 sm:inline-flex" render={<Link href="/register" />}>
          Registrarse
        </Button>
      </div>
    );
  }

  const unreadCount = await getUnreadNotificationCount(viewer.id);

  return (
    <div className="flex items-center gap-1">
      <MainNav className="hidden items-center md:flex" initialUnreadCount={unreadCount} />
      <AccountDrawer viewer={viewer} />
    </div>
  );
}
