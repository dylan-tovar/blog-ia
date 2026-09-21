"use client";

import { usePathname } from "next/navigation";
import { getPageTitle } from "@/components/shared/navigation";

export function HeaderTitle() {
  const pathname = usePathname();

  return (
    <p className="min-w-0 truncate text-lg font-semibold text-foreground">
      {getPageTitle(pathname)}
    </p>
  );
}
