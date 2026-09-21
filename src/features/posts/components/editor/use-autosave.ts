"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createDraftPost, savePostContent } from "@/features/posts/actions";
import { findLimitIssue } from "@/features/posts/limits";

export type SaveState = "idle" | "saving" | "saved" | "error" | "title-too-long" | "content-too-long";
export type Draft = { title: string; content: string };

const AUTOSAVE_DELAY_MS = 2000;

export function useAutosave(initialPostId: string, initialDraft: Draft) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const postId = useRef(initialPostId);
  const latest = useRef(initialDraft);
  const saved = useRef(initialDraft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<string | null>>(Promise.resolve(null));

  const persist = useCallback(() => {
    const run = async (): Promise<string | null> => {
      const draft = latest.current;
      const id = postId.current;

      const limitIssue = findLimitIssue(draft);
      if (limitIssue) {
        setSaveState(limitIssue === "title" ? "title-too-long" : "content-too-long");
        return null;
      }

      if (id === "new") {
        if (!draft.title.trim() && !draft.content.trim()) {
          setSaveState("idle");
          return null;
        }

        setSaveState("saving");
        const created = await createDraftPost(draft);
        if (!created.ok || !created.postId) {
          setSaveState("error");
          return null;
        }

        postId.current = created.postId;
        saved.current = draft;
        window.history.replaceState(null, "", `/editor/${created.postId}`);
        setSaveState("saved");
        return created.postId;
      }

      if (draft.title === saved.current.title && draft.content === saved.current.content) {
        return id;
      }

      setSaveState("saving");
      const result = await savePostContent(id, draft);
      if (!result.ok) {
        setSaveState("error");
        return null;
      }

      saved.current = draft;
      setSaveState("saved");
      return id;
    };

    queue.current = queue.current.then(run, run);
    return queue.current;
  }, []);

  const update = useCallback(
    (patch: Partial<Draft>) => {
      latest.current = { ...latest.current, ...patch };
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => {
        timer.current = null;
        void persist();
      }, AUTOSAVE_DELAY_MS);
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        void persist();
      }
    },
    [persist],
  );

  const getContent = useCallback(() => latest.current.content, []);

  return { saveState, update, persist, getContent };
}
