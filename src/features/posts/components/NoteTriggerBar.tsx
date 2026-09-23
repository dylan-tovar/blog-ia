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
          "group flex min-h-16 w-full cursor-pointer items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 text-left text-[15px] text-muted-foreground shadow-xs transition-all hover:border-border hover:bg-muted hover:scale-[0.99] hover:text-foreground active:scale-[0.99]",
          className,
        )}
      >
        <UserAvatar name={viewerName} size="default" className="size-9 shrink-0 ring-1 ring-border transition-transform group-hover:scale-105" />
        <span className="truncate select-none font-normal">¿Qué estás pensando?</span>
      </button>

      <NoteDialog open={open} onOpenChange={setOpen} viewerName={viewerName} />
    </>
  );
}
