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

        <DropdownMenuContent side={side} align={align} className={cn("w-(--anchor-width)", contentClassName)}>
          <DropdownMenuItem
            className="min-h-9 cursor-pointer gap-2.5 px-3 font-medium"
            onClick={() => {
              openNoteAfterClose.current = true;
            }}
          >
            <StickyNote aria-hidden />
            <span>Nota</span>
          </DropdownMenuItem>

          {isDesktop ? (
            <DropdownMenuItem
              className="min-h-9 cursor-pointer gap-2.5 px-3 font-medium"
              render={<Link href="/editor/new" />}
            >
              <FileText aria-hidden />
              <span>Artículo</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled className="min-h-9 gap-2.5 px-3 font-medium">
              <FileText aria-hidden />
              <span>Artículo</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <NoteDialog open={noteOpen} onOpenChange={setNoteOpen} viewerName={viewerName} />
    </>
  );
}
