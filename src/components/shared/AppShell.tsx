import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Newspaper } from "lucide-react";
import { BottomNav } from "@/components/shared/BottomNav";
import { HeaderAccount } from "@/components/shared/HeaderAccount";
import { HeaderTitle } from "@/components/shared/HeaderTitle";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { getViewer } from "@/lib/viewer";

type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

// The session-dependent parts sit behind <Suspense> so the shell streams
// immediately instead of waiting on the auth lookup.
async function SignedInChrome({ fab }: { fab?: (viewer: Viewer) => ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) {
    return null;
  }

  const unreadCount = await getUnreadNotificationCount(viewer.id);

  return (
    <>
      {fab?.(viewer)}
      <BottomNav initialUnreadCount={unreadCount} />
    </>
  );
}

export function AppShell({
  children,
  fab,
}: {
  children: ReactNode;
  fab?: (viewer: Viewer) => ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-2xl items-center gap-3 px-4">
          <Link
            href="/"
            aria-label="Ir al inicio"
            className="grid min-h-11 min-w-11 place-items-center text-primary"
          >
            <Newspaper className="size-7" aria-hidden />
          </Link>
          <HeaderTitle />
          <div className="ml-auto">
            <Suspense fallback={<div className="min-h-11 min-w-11" />}>
              <HeaderAccount />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col pb-28 md:pb-12">
        {children}
      </main>
      <Suspense fallback={null}>
        <SignedInChrome fab={fab} />
      </Suspense>
    </>
  );
}
