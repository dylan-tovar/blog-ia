"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Bell,
  Bookmark,
  House,
  Inbox,
  Loader2,
  Search,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { signOut } from "@/features/auth/actions";

interface AccountDrawerProps {
  viewer: {
    id: string;
    displayName: string | null;
    username?: string | null;
  };
}

export function AccountDrawer({ viewer }: AccountDrawerProps) {
  const [open, setOpen] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();

  const displayName = viewer.displayName || "Usuario";
  const username = viewer.username ? `@${viewer.username}` : "";

  function close() {
    setOpen(false);
  }

  function handleSignOut() {
    startSignOut(async () => {
      await signOut();
    });
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      <DrawerTrigger
        type="button"
        aria-label="Menú de cuenta"
        className="grid min-h-11 min-w-11 place-items-center cursor-pointer transition-opacity hover:opacity-80"
      >
        <UserAvatar name={viewer.displayName} size="lg" />
      </DrawerTrigger>

      <DrawerContent className="mx-2 sm:mx-auto sm:max-w-md mb-2 pb-3 pt-1 [--drawer-inset:0.5rem] data-[swipe-direction=down]:rounded-2xl data-[swipe-direction=down]:border border-border/80 shadow-2xl after:hidden">
        <DrawerHeader className="sr-only">
          <DrawerTitle>Menú de cuenta</DrawerTitle>
          <DrawerDescription>Opciones de tu cuenta y navegación rápida</DrawerDescription>
        </DrawerHeader>

        {/* PROFILE HEADER */}
        <Link
          href="/profile"
          onClick={close}
          className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/60 cursor-pointer rounded-t-xl"
        >
          <UserAvatar name={viewer.displayName} size="lg" className="size-11" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight text-foreground">
              {displayName}
            </p>
            {username && (
              <p className="truncate text-sm text-muted-foreground mt-0.5">
                {username}
              </p>
            )}
          </div>
        </Link>

        <div className="border-t border-border/60" />

        {/* MAIN NAVIGATION LIST WITH ICONS */}
        <div className="flex flex-col py-1">
          <Link
            href="/"
            onClick={close}
            className="flex items-center gap-4 px-4 py-2.5 text-[15px] text-foreground transition-colors hover:bg-muted/60 cursor-pointer"
          >
            <House className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Home</span>
          </Link>

          <Link
            href="/subscriptions"
            onClick={close}
            className="flex items-center gap-4 px-4 py-2.5 text-[15px] text-foreground transition-colors hover:bg-muted/60 cursor-pointer"
          >
            <Inbox className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Subscriptions</span>
          </Link>

          <Link
            href="/saved"
            onClick={close}
            className="flex items-center gap-4 px-4 py-2.5 text-[15px] text-foreground transition-colors hover:bg-muted/60 cursor-pointer"
          >
            <Bookmark className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Saved</span>
          </Link>

          <Link
            href="/activity"
            onClick={close}
            className="flex items-center gap-4 px-4 py-2.5 text-[15px] text-foreground transition-colors hover:bg-muted/60 cursor-pointer"
          >
            <Bell className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Activity</span>
          </Link>

          <Link
            href="/explore"
            onClick={close}
            className="flex items-center gap-4 px-4 py-2.5 text-[15px] text-foreground transition-colors hover:bg-muted/60 cursor-pointer"
          >
            <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span>Explore</span>
          </Link>
        </div>

        <div className="border-t border-border/60" />

        {/* SETTINGS / SUPPORT / SIGN OUT */}
        <div className="flex flex-col py-1">
          <Link
            href="/settings"
            onClick={close}
            className="px-4 py-2.5 text-[15px] text-muted-foreground transition-colors hover:bg-muted/60 cursor-pointer"
          >
            Settings
          </Link>

          <Link
            href="/support"
            onClick={close}
            className="px-4 py-2.5 text-[15px] text-muted-foreground transition-colors hover:bg-muted/60 cursor-pointer"
          >
            Support
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="flex items-center gap-2 px-4 py-2.5 text-left text-[15px] text-muted-foreground transition-colors hover:bg-muted/60 cursor-pointer disabled:opacity-50"
          >
            {isSigningOut && <Loader2 className="size-4 animate-spin" />}
            <span>Sign out</span>
          </button>
        </div>

        <div className="border-t border-border/60" />

        {/* FOOTER LINKS */}
        <DrawerFooter className="px-4 pt-3 pb-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <Link href="/about" onClick={close} className="hover:text-foreground transition-colors">
              About
            </Link>
            <Link href="/privacy" onClick={close} className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/terms" onClick={close} className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/data" onClick={close} className="hover:text-foreground transition-colors">
              Data
            </Link>
            <Link href="/accessibility" onClick={close} className="hover:text-foreground transition-colors">
              Accessibility
            </Link>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
