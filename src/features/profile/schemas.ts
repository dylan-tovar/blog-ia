import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, {
    error:
      "El usuario debe tener entre 3 y 20 caracteres: letras, números o guion bajo.",
  });

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: "Ingresá un nombre para mostrar." }),
  username: usernameSchema,
});
