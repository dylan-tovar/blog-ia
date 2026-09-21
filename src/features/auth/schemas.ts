import { z } from "zod";
import { usernameSchema } from "@/features/profile/schemas";

export const registerSchema = z.object({
  email: z.email({ error: "Ingresá un email válido." }),
  password: z
    .string()
    .min(8, { error: "La contraseña debe tener al menos 8 caracteres." }),
  displayName: z
    .string()
    .trim()
    .min(1, { error: "Ingresá un nombre para mostrar." }),
  username: usernameSchema,
});

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { error: "Ingresá tu email o usuario." })
    .max(254, { error: "Ingresá tu email o usuario." }),
  password: z.string().min(1, { error: "Ingresá tu contraseña." }),
});
