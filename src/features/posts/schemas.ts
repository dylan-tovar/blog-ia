import { z } from "zod";
import {
  NOTE_MAX_LENGTH,
  POST_CONTENT_MAX_LENGTH,
  POST_TITLE_MAX_LENGTH,
} from "@/features/posts/constants";

export const idSchema = z.uuid();

export const tagNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { error: "El tag no puede estar vacío." })
  .max(50, { error: "El tag es demasiado largo." });

export const feedScopeSchema = z.enum(["global", "following"]);

// `following` is resolved server-side from the session: the client never sends author ids.
export const feedQuerySchema = z.object({
  tag: tagNameSchema.optional(),
  scope: feedScopeSchema.default("global"),
  offset: z.number().int().min(0).max(10_000).default(0),
});

export const savePostSchema = z.object({
  title: z.string().trim().max(POST_TITLE_MAX_LENGTH).optional(),
  content: z.string().max(POST_CONTENT_MAX_LENGTH),
});

export const postTypeSchema = z.enum(["note", "article"]);

export const createNoteSchema = z.object({
  content: z
    .string({ error: "La nota no puede estar vacía." })
    .trim()
    .min(1, { error: "La nota no puede estar vacía." })
    .max(NOTE_MAX_LENGTH, {
      error: `La nota no puede superar los ${NOTE_MAX_LENGTH} caracteres.`,
    }),
  parentPostId: idSchema.optional(),
  replyToPostId: idSchema.optional(),
});
