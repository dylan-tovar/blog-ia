import { z } from "zod";
import { SEARCH_QUERY_MAX_LENGTH } from "@/features/discovery/constants";

export const searchQuerySchema = z.object({
  q: z
    .string({ error: "Escribí algo para buscar." })
    .trim()
    .min(1, { error: "Escribí algo para buscar." })
    .max(SEARCH_QUERY_MAX_LENGTH, { error: "La búsqueda es demasiado larga." }),
});
