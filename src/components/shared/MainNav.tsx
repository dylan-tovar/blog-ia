"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, House, Search, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, NAV_ITEMS } from "@/components/shared/navigation";

// Desktop-only links; the avatar next to them already leads to the profile.
const ITEMS = NAV_ITEMS.filter((item) => item.href !== "/profile");

const ICONS: Record<string, LucideIcon> = {
  "/": House,
  "/explore": Search,
  "/activity": Bell,
};

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Principal" className={className}>
      {ITEMS.map((item) => {
        const Icon = ICONS[item.href];
        const active = isNavItemActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={item.label}
            title={item.label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "grid min-h-11 min-w-11 place-items-center rounded-md transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon && <Icon className="size-5" aria-hidden />}
          </Link>
        );
      })}
    </nav>
  );
}
