"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";

export function RightRailContainer({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Only show the right discovery rail on Inicio ("/") and Explorar ("/explore")
  const isDiscoveryRoute = pathname === "/" || pathname.startsWith("/explore");

  if (!isDiscoveryRoute) {
    return null;
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-96 shrink-0 flex-col overflow-y-auto pt-6 px-4 pb-6 mr-4 xl:flex">
      {children}
    </aside>
  );
}
