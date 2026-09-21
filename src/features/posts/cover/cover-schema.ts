import { z } from "zod";
import { isOwnCoverImage } from "@/features/posts/cover/cover";
import {
  DEFAULT_COVER_COLOR,
  isCoverColor,
  type CoverColor,
} from "@/features/posts/cover/cover-palette";

// Keep in sync with `posts_cover_text_check` in supabase/migrations/0009_post_cover.sql.
export const COVER_TEXT_MAX_LENGTH = 200;
const COVER_URL_MAX_LENGTH = 500;

export interface CoverValue {
  imageUrl: string | null;
  text: string | null;
  color: CoverColor | null;
}

export function createCoverSchema({ supabaseUrl, userId }: { supabaseUrl: string; userId: string }) {
  return z
    .object({
      imageUrl: z.string().max(COVER_URL_MAX_LENGTH).nullish(),
      text: z
        .string()
        .trim()
        .max(COVER_TEXT_MAX_LENGTH, {
          error: `El texto de la portada no puede superar los ${COVER_TEXT_MAX_LENGTH} caracteres.`,
        })
        .nullish(),
      color: z.string().nullish(),
    })
    .superRefine((value, ctx) => {
      if (value.imageUrl && !isOwnCoverImage(value.imageUrl, supabaseUrl, userId)) {
        ctx.addIssue({
          code: "custom",
          path: ["imageUrl"],
          message: "La imagen de portada tiene que ser una de tus imágenes subidas.",
        });
      }
      if (value.color && !isCoverColor(value.color)) {
        ctx.addIssue({ code: "custom", path: ["color"], message: "Elegí un color de la lista." });
      }
    })
    .transform((value): CoverValue => {
      const text = value.text?.trim() || null;
      return {
        imageUrl: value.imageUrl || null,
        text,
        color: text ? (isCoverColor(value.color) ? value.color : DEFAULT_COVER_COLOR) : null,
      };
    });
}
