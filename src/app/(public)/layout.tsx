import type { ReactNode } from "react";
import { AppShell } from "@/components/shared/AppShell";
import { NewPostButton } from "@/features/posts/components/NewPostButton";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell rightRail fab={(viewer) => <NewPostButton viewerName={viewer.displayName} />}>
      {children}
    </AppShell>
  );
}
