import { z } from "zod";
import { passwordFieldSchema } from "@/features/auth/password-rules";

export const registerSchema = z
  .object({
    email: z.email({ error: "Ingresá un email válido." }),
    password: passwordFieldSchema(),
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

export const forgotPasswordSchema = z.object({
  email: z.email({ error: "Ingresá un email válido." }),
});

export const resetPasswordSchema = z
  .object({
    password: passwordFieldSchema(),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "Las contraseñas no coinciden.",
    path: ["confirmPassword"],
  });

export const verifyOtpSchema = z.object({
  email: z.email({ error: "Ingresá un email válido." }),
  // Supabase's email OTP is a 6-digit numeric code.
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, { error: "Ingresá el código de 6 dígitos." }),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Ingresá tu contraseña actual." }),
    newPassword: passwordFieldSchema(),
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    error: "Las contraseñas no coinciden.",
    path: ["confirmNewPassword"],
  });
