"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Search, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive, NAV_ITEMS } from "@/components/shared/navigation";
import { NotificationBell } from "@/components/shared/NotificationBell";

const ICONS: Partial<Record<(typeof NAV_ITEMS)[number]["href"], LucideIcon>> = {
  "/": House,
  "/explore": Search,
  "/profile": User,
};

export function BottomNav({ initialUnreadCount = 0 }: { initialUnreadCount?: number }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-2xl">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.href];
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 items-center justify-center transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.href === "/activity" ? (
                  <NotificationBell initialCount={initialUnreadCount} className="size-6" />
                ) : (
                  Icon && <Icon className="size-6" aria-hidden />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
