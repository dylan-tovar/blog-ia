"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  ChevronDown,
  FileText,
  House,
  LogOut,
  MoreHorizontal,
  Newspaper,
  Search,
  Settings,
  SquarePen,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemActive } from "@/components/shared/navigation";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { CreatePostMenu } from "@/features/posts/components/CreatePostMenu";
import { LoginDrawer } from "@/features/auth/components/LoginDrawer";
import { signOut } from "@/features/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DesktopSidebarProps {
  viewer: {
    id: string;
    displayName: string | null;
    username?: string | null;
  } | null;
  initialUnreadCount?: number;
}

export function DesktopSidebar({ viewer, initialUnreadCount = 0 }: DesktopSidebarProps) {
  const pathname = usePathname();
  const [isSigningOut, startSignOut] = useTransition();

  const navLinks = [
    { href: "/", label: "Inicio", icon: House },
    { href: "/explore", label: "Explorar", icon: Search },
    ...(viewer
      ? [
        { href: "/activity", label: "Actividad", icon: null },
        { href: "/posts", label: "Mis posts", icon: FileText },
        { href: "/profile", label: "Perfil", icon: User },
      ]
      : []),
  ];

  return (
    <div className="flex h-full flex-col justify-between py-4 select-none">
      {/* Top section: Logo + Navigation Links + Create Button */}
      <div className="flex flex-col items-center lg:items-start gap-3">
        {/* Brand Logo */}
        <Link
          href="/"
          aria-label="Ir al inicio"
          className="group flex items-center gap-3 rounded-2xl p-2.5 text-primary transition-colors hover:bg-accent/50"
        >
          <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
            <Newspaper className="size-6" aria-hidden />
          </div>
          <span className="hidden text-xl font-bold tracking-tight text-foreground lg:inline">
            BlogIA
          </span>
        </Link>

        {/* Navigation list */}
        <nav aria-label="Navegación de escritorio" className="flex w-full flex-col gap-1 mt-2">
          {navLinks.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex min-h-12 w-full items-center justify-center gap-4 rounded-lg px-3 py-2.5 text-base font-medium transition-all hover:bg-accent/60 lg:justify-start lg:px-4",
                  active
                    ? "font-semibold text-foreground bg-accent/40"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <div className="relative grid size-7 place-items-center">
                  {item.href === "/activity" ? (
                    <NotificationBell
                      initialCount={initialUnreadCount}
                      className="size-6 transition-transform group-hover:scale-110"
                      pollQuery="(min-width: 768px)"
                    />
                  ) : (
                    Icon && (
                      <Icon
                        className={cn(
                          "size-6 transition-transform group-hover:scale-110",
                          active && "text-primary",
                        )}
                        aria-hidden
                      />
                    )
                  )}
                </div>
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}

          {!viewer && (
            <LoginDrawer
              trigger={
                <button
                  type="button"
                  aria-label="Perfil"
                  className="group flex min-h-12 w-full cursor-pointer items-center justify-center gap-4 rounded-lg px-3 py-2.5 text-base font-medium text-muted-foreground transition-all hover:bg-accent/60 hover:text-foreground lg:justify-start lg:px-4"
                >
                  <div className="relative grid size-7 place-items-center">
                    <User
                      className="size-6 transition-transform group-hover:scale-110"
                      aria-hidden
                    />
                  </div>
                  <span className="hidden lg:inline">Perfil</span>
                </button>
              }
            />
          )}
        </nav>

        {/* Prominent "Crear" Button */}
        <div className="w-full mt-4">
          {viewer ? (
            <CreatePostMenu
              viewerName={viewer.displayName}
              label="Crear publicación"
              side="bottom"
              align="start"
              className="group flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] lg:justify-between"
            >
              <div className="flex items-center gap-2">
                <SquarePen className="size-5 transition-transform group-hover:rotate-6" aria-hidden />
                <span className="hidden lg:inline text-[15px]">Crear</span>
              </div>
              <ChevronDown className="hidden size-4 opacity-75 lg:inline" aria-hidden />
            </CreatePostMenu>
          ) : (
            <LoginDrawer
              trigger={
                <button
                  type="button"
                  aria-label="Crear publicación"
                  className="group flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] lg:justify-between"
                >
                  <div className="flex items-center gap-2">
                    <SquarePen className="size-5 transition-transform group-hover:rotate-6" aria-hidden />
                    <span className="hidden lg:inline text-[15px]">Crear</span>
                  </div>
                  <ChevronDown className="hidden size-4 opacity-75 lg:inline" aria-hidden />
                </button>
              }
            />
          )}
        </div>
      </div>

      {/* Bottom section: User Account Profile */}
      {viewer && (
        <div className="w-full pt-4">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Opciones de cuenta"
              className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/60 lg:justify-between lg:px-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <UserAvatar name={viewer.displayName} size="default" className="size-9 shrink-0" />
                <div className="hidden flex-col text-left lg:flex min-w-0">
                  <span className="truncate text-sm font-semibold text-foreground leading-tight">
                    {viewer.displayName || "Usuario"}
                  </span>
                  {viewer.username && (
                    <span className="truncate text-xs text-muted-foreground">
                      @{viewer.username}
                    </span>
                  )}
                </div>
              </div>
              <MoreHorizontal className="hidden size-5 text-muted-foreground lg:inline shrink-0" />
            </DropdownMenuTrigger>

            <DropdownMenuContent side="top" align="start" className="w-52 p-1.5 shadow-xl">
              <DropdownMenuItem render={<Link href="/profile" />} className="cursor-pointer gap-2 py-2">
                <User className="size-4 text-muted-foreground" />
                <span>Perfil</span>
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/posts" />} className="cursor-pointer gap-2 py-2">
                <FileText className="size-4 text-muted-foreground" />
                <span>Mis publicaciones</span>
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings" />} className="cursor-pointer gap-2 py-2">
                <Settings className="size-4 text-muted-foreground" />
                <span>Configuración</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={isSigningOut}
                onClick={() => startSignOut(async () => { await signOut(); })}
                className="cursor-pointer gap-2 py-2 text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" />
                <span>Cerrar sesión</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
