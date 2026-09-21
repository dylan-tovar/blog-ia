import { z } from "zod";
import {
  PASSWORD_MAX_LENGTH_MESSAGE,
  PASSWORD_RULES,
  isWithinMaxLength,
} from "@/features/auth/password-rules";

export const registerSchema = z
  .object({
    email: z.email({ error: "Ingresá un email válido." }),
    password: z.string().superRefine((password, ctx) => {
      for (const rule of PASSWORD_RULES) {
        if (!rule.test(password)) ctx.addIssue({ code: "custom", message: rule.message });
      }
      if (!isWithinMaxLength(password)) {
        ctx.addIssue({ code: "custom", message: PASSWORD_MAX_LENGTH_MESSAGE });
      }
    }),
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
