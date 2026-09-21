"use client";

import { useRef, useState, type ComponentProps, type ReactNode } from "react";
import Link from "next/link";
import { FileText, StickyNote } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NoteDialog } from "@/features/posts/components/NoteDialog";
import { useIsDesktop } from "@/hooks/use-is-desktop";
import { cn } from "@/lib/utils";

interface CreatePostMenuProps {
  viewerName: string | null;
  label?: string;
  className?: string;
  contentClassName?: string;
  side?: ComponentProps<typeof DropdownMenuContent>["side"];
  align?: ComponentProps<typeof DropdownMenuContent>["align"];
  children: ReactNode;
}

export function CreatePostMenu({
  viewerName,
  label,
  className,
  contentClassName,
  side,
  align,
  children,
}: CreatePostMenuProps) {
  const isDesktop = useIsDesktop();
  const [noteOpen, setNoteOpen] = useState(false);
  const openNoteAfterClose = useRef(false);

  // The dialog opens once the menu has finished closing so the menu's focus return
  // to the trigger cannot steal focus from the dialog.
  function handleMenuOpenChangeComplete(open: boolean) {
    if (!open && openNoteAfterClose.current) {
      openNoteAfterClose.current = false;
      setNoteOpen(true);
    }
  }

  return (
    <>
      <DropdownMenu onOpenChangeComplete={handleMenuOpenChangeComplete}>
        <DropdownMenuTrigger aria-label={label} className={className}>
          {children}
        </DropdownMenuTrigger>

        <DropdownMenuContent side={side} align={align} className={cn("w-64", contentClassName)}>
          <DropdownMenuItem
            className="min-h-11 gap-3 px-3 md:min-h-9"
            onClick={() => {
              openNoteAfterClose.current = true;
            }}
          >
            <StickyNote aria-hidden />
            <span className="flex flex-col">
              <span className="font-medium">Nota</span>
              <span className="text-xs text-muted-foreground">Texto corto, hasta 500 caracteres</span>
            </span>
          </DropdownMenuItem>

          {isDesktop ? (
            <DropdownMenuItem
              className="min-h-11 gap-3 px-3 md:min-h-9"
              render={<Link href="/editor/new" />}
            >
              <FileText aria-hidden />
              <span className="flex flex-col">
                <span className="font-medium">Artículo</span>
                <span className="text-xs text-muted-foreground">Editor completo con markdown</span>
              </span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled className="min-h-11 gap-3 px-3">
              <FileText aria-hidden />
              <span className="flex flex-col">
                <span className="font-medium">Artículo</span>
                <span className="text-xs text-muted-foreground">
                  Disponible solo desde computadora
                </span>
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <NoteDialog open={noteOpen} onOpenChange={setNoteOpen} viewerName={viewerName} />
    </>
  );
}
