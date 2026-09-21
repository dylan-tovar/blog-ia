import type { ReactNode } from "react";
import { AppShell } from "@/components/shared/AppShell";
import { NewPostButton } from "@/features/posts/components/NewPostButton";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <AppShell fab={(viewer) => <NewPostButton viewerName={viewer.displayName} />}>{children}</AppShell>;
}
