"use client";

import { useState } from "react";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { NoteDialog } from "@/features/posts/components/NoteDialog";
import { cn } from "@/lib/utils";

interface NoteTriggerBarProps {
  viewerName: string | null;
  className?: string;
}

export function NoteTriggerBar({ viewerName, className }: NoteTriggerBarProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-full text-left text-[15px] text-muted-foreground transition-colors hover:text-foreground",
          className,
        )}
      >
        <UserAvatar name={viewerName} size="sm" />
        <span className="truncate">¿Qué estás pensando?</span>
      </button>

      <NoteDialog open={open} onOpenChange={setOpen} viewerName={viewerName} />
    </>
  );
}
