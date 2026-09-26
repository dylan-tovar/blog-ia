import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MainNav } from "@/components/shared/MainNav";
import { AccountDrawer } from "@/components/shared/AccountDrawer";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
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

  return (
    <div className="flex items-center gap-1">
      <MainNav className="hidden items-center md:flex" />
      <AccountDrawer viewer={viewer} />
    </div>
  );
}
