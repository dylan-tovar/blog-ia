import { z } from "zod";

export const registerSchema = z
  .object({
    email: z.email({ error: "Ingresá un email válido." }),
    password: z
      .string()
      .min(8, { error: "La contraseña debe tener al menos 8 caracteres." }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { error: "Ingresá tu email o usuario." })
    .max(254, { error: "Ingresá tu email o usuario." }),
  password: z.string().min(1, { error: "Ingresá tu contraseña." }),
});
