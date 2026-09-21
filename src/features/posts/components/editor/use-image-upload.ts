"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import { describeImageError } from "@/features/posts/images/image-errors";
import { defaultAltText } from "@/features/posts/images/image-utils";
import { uploadPostImage } from "@/features/posts/images/upload-post-image";

export interface ImageUploadState {
  uploading: boolean;
  error: string | null;
  dismissError: () => void;
  insertFiles: (files: File[], position?: number) => void;
}

// Files are processed one at a time so several dropped images land in order and the
// browser never holds more than one decoded bitmap.
export function useImageUpload(editorRef: RefObject<Editor | null>): ImageUploadState {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const insertFiles = useCallback(
    (files: File[], position?: number) => {
      if (files.length === 0) {
        return;
      }
      setError(null);
      setPending((count) => count + files.length);

      let at = position;
      for (const file of files) {
        queue.current = queue.current.then(async () => {
          try {
            const { url } = await uploadPostImage(file);
            const editor = editorRef.current;
            if (!editor || editor.isDestroyed) {
              return;
            }
            const target = Math.min(at ?? editor.state.selection.to, editor.state.doc.content.size);
            editor
              .chain()
              .focus()
              .insertContentAt(target, {
                type: "image",
                attrs: { src: url, alt: defaultAltText(file.name) },
              })
              .run();
            at = undefined;
          } catch (uploadError) {
            setError(describeImageError(uploadError));
          } finally {
            setPending((count) => count - 1);
          }
        });
      }
    },
    [editorRef],
  );

  return {
    uploading: pending > 0,
    error,
    dismissError: () => setError(null),
    insertFiles,
  };
}
