import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Newspaper } from "lucide-react";
import { BottomNav } from "@/components/shared/BottomNav";
import { HeaderAccount } from "@/components/shared/HeaderAccount";
import { HeaderTitle } from "@/components/shared/HeaderTitle";
import { DesktopSidebar } from "@/components/shared/DesktopSidebar";
import { RightRail } from "@/components/shared/RightRail";
import { RightRailContainer } from "@/components/shared/RightRailContainer";
import { getUnreadNotificationCount } from "@/features/notifications/queries";
import { getViewer } from "@/lib/viewer";

type Viewer = NonNullable<Awaited<ReturnType<typeof getViewer>>>;

async function DesktopSidebarLoader() {
  const viewer = await getViewer();
  const unreadCount = viewer ? await getUnreadNotificationCount(viewer.id) : 0;
  return <DesktopSidebar viewer={viewer} initialUnreadCount={unreadCount} />;
}

function DesktopSidebarSkeleton() {
  return (
    <div className="flex h-full flex-col justify-between py-4 animate-pulse">
      <div className="flex flex-col items-center xl:items-start gap-4">
        <div className="size-10 rounded-xl bg-muted" />
        <div className="flex flex-col gap-2 w-full mt-2">
          <div className="h-10 rounded-full bg-muted w-10 xl:w-48" />
          <div className="h-10 rounded-full bg-muted w-10 xl:w-48" />
          <div className="h-10 rounded-full bg-muted w-10 xl:w-48" />
        </div>
      </div>
      <div className="h-12 rounded-full bg-muted w-10 xl:w-full" />
    </div>
  );
}

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
      <BottomNav initialUnreadCount={unreadCount} viewerUsername={viewer.username} />
    </>
  );
}

export function AppShell({
  children,
  fab,
  rightRail = false,
}: {
  children: ReactNode;
  fab?: (viewer: Viewer) => ReactNode;
  // Opt-in: the discovery sidebar (search/suggested people/topics) only makes sense on
  // the public feed, not on dashboard pages like the editor or settings — those would
  // otherwise pay for its query chain on every load for no reason.
  rightRail?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile Top Header */}
      <header className="sticky top-0 z-40 bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
        <div className="mx-auto flex min-h-16 w-full max-w-2xl items-center gap-3 px-4">
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

      {/* Main desktop layout: sidebar docked to the left edge */}
      <div className="flex min-h-screen w-full">
        {/* Left Column: Desktop Navigation Sidebar pinned to the left */}
        <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col ml-2 px-3 md:flex lg:w-60 xl:w-64 lg:px-4">
          <Suspense fallback={<DesktopSidebarSkeleton />}>
            <DesktopSidebarLoader />
          </Suspense>
        </aside>

        {/* Center Column: Feed / Main Content */}
        <div className="flex flex-1 min-w-0 justify-center px-0 md:px-4">
          <main className="flex w-full min-w-0 max-w-3xl xl:max-w-4xl flex-col pb-28 md:pb-12 min-h-screen">
            {children}
          </main>
        </div>

        {/* Right Column: desktop discovery widgets (search/suggested people/topics) */}
        {rightRail && (
          <RightRailContainer>
            <Suspense fallback={null}>
              <RightRail />
            </Suspense>
          </RightRailContainer>
        )}
      </div>

      {/* Mobile Bottom Navigation & Mobile FAB */}
      <Suspense fallback={null}>
        <SignedInChrome fab={fab} />
      </Suspense>
    </div>
  );
}
