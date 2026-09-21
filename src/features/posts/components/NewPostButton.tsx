"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CreatePostMenu } from "@/features/posts/components/CreatePostMenu";
import { NoteDialog } from "@/features/posts/components/NoteDialog";

const FAB_POSITION =
  "fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 md:right-8 md:bottom-8";

const FAB_CLASS =
  "grid size-14 cursor-pointer place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-black/40 outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95";

export function NewPostButton({ viewerName }: { viewerName: string | null }) {
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <>
      <div className={`${FAB_POSITION} md:hidden`}>
        <button
          type="button"
          aria-label="Nueva nota"
          aria-haspopup="dialog"
          onClick={() => setNoteOpen(true)}
          className={FAB_CLASS}
        >
          <Plus className="size-7" aria-hidden />
        </button>
        <NoteDialog open={noteOpen} onOpenChange={setNoteOpen} viewerName={viewerName} />
      </div>

      <div className={`${FAB_POSITION} hidden md:block`}>
        <CreatePostMenu
          viewerName={viewerName}
          label="Crear"
          className={FAB_CLASS}
          side="top"
          align="end"
        >
          <Plus className="size-7" aria-hidden />
        </CreatePostMenu>
      </div>
    </>
  );
}
