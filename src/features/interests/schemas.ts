import { z } from "zod";
import { INTERESTS_MAX } from "@/features/interests/constants";

export const interestsSchema = z.object({
  tagIds: z
    .array(z.uuid({ error: "Tema inválido." }))
    .max(INTERESTS_MAX, { error: `Podés elegir hasta ${INTERESTS_MAX} temas.` })
    .refine((ids) => new Set(ids).size === ids.length, {
      error: "Hay temas repetidos.",
    }),
});
