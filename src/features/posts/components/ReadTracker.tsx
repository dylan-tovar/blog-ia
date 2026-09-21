"use client";

import { useEffect } from "react";
import { recordRead } from "@/features/posts/actions";

export function ReadTracker({ postId }: { postId: string }) {
  useEffect(() => {
    void recordRead(postId);
  }, [postId]);

  return null;
}
