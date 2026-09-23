import { z } from "zod";

// Segmentos de ruta reales bajo src/app/ (route groups aparte) — un username
// que coincida nunca sería alcanzable en /[username], porque la ruta
// estática siempre gana. `author` y `post` quedan reservados aunque ahora
// sean solo shims de redirect (ver /author/[id] y /post/:id en next.config).
const RESERVED_USERNAMES = new Set([
  "login",
  "forgot-password",
  "onboarding",
  "register",
  "reset-password",
  "activity",
  "posts",
  "profile",
  "settings",
  "editor",
  "author",
  "explore",
  "post",
  "p",
  "api",
  "auth",
  "unsubscribe",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, {
    error:
      "El usuario debe tener entre 3 y 20 caracteres: letras, números o guion bajo.",
  })
  .refine((value) => !RESERVED_USERNAMES.has(value), {
    error: "Ese nombre de usuario no está disponible.",
  });

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: "Ingresá un nombre para mostrar." }),
  username: usernameSchema,
});

export const onboardingSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, { error: "Ingresá un nombre para mostrar." }),
  username: usernameSchema,
});
