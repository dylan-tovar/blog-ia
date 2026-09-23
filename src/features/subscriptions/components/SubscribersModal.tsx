"use client";

import { isValidElement, useState } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { FollowButton } from "@/features/subscriptions/components/FollowButton";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import type { Subscriber } from "@/features/subscriptions/queries";

interface SubscribersModalProps {
  authorName: string;
  subscribers: Subscriber[];
  viewerId: string | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function isReactElement(value: unknown): value is React.ReactElement {
  return (
    isValidElement(value) ||
    (typeof value === "object" &&
      value !== null &&
      ("$$typeof" in value || "type" in value))
  );
}

export function SubscribersModal({
  authorName,
  subscribers,
  viewerId,
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
}: SubscribersModalProps) {
  const isDesktop = useIsDesktop();
  const [internalOpen, setInternalOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? setControlledOpen! : setInternalOpen;

  const content = (
    <div className="flex flex-col gap-3 py-1">
      {subscribers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-neutral-800/60 text-muted-foreground">
            <Users className="size-6" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Todavía no hay suscriptores
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cuando alguien se suscriba a este perfil, aparecerá acá.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40">
          {subscribers.map((sub) => (
            <li
              key={sub.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
            >
              <Link
                href={`/${sub.username}`}
                onClick={() => setOpen(false)}
                className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-85"
              >
                <UserAvatar name={sub.displayName} className="size-10 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground leading-tight hover:underline">
                    {sub.displayName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{sub.username}
                  </span>
                </div>
              </Link>

              {viewerId && viewerId !== sub.id && (
                <FollowButton
                  authorId={sub.id}
                  initialFollowing={sub.isFollowing}
                  variant="compact"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger ? (
          isReactElement(trigger) ? (
            <DialogTrigger render={trigger} />
          ) : (
            <DialogTrigger className="cursor-pointer">{trigger}</DialogTrigger>
          )
        ) : null}
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/60">
            <DialogTitle className="text-base font-bold text-foreground">
              Suscriptores ({subscribers.length})
            </DialogTitle>
            <DialogDescription className="sr-only">
              Lista de suscriptores de {authorName}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-5 pb-4 pt-2">
            {content}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      {trigger ? (
        isReactElement(trigger) ? (
          <DrawerTrigger render={trigger} />
        ) : (
          <DrawerTrigger className="cursor-pointer">{trigger}</DrawerTrigger>
        )
      ) : null}
      <DrawerContent className="mx-2 mb-2 pb-6 pt-1 max-h-[85dvh] [--drawer-inset:0.5rem] data-[swipe-direction=down]:rounded-2xl data-[swipe-direction=down]:border border-border/80 shadow-2xl after:hidden">
        <DrawerHeader className="px-4 pt-3 pb-3 border-b border-border/60 text-left">
          <DrawerTitle className="text-base font-bold text-foreground">
            Suscriptores ({subscribers.length})
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Lista de suscriptores de {authorName}
          </DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[60vh] overflow-y-auto px-4 pb-2 pt-2">
          {content}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
