import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

// Lazy on purpose: only the username-login path needs the secret key, so a
// missing value must not break every page that imports the auth actions.
export function getServerEnv() {
  return serverEnvSchema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
}

export const AI_PROVIDERS = ["claude", "gemini", "openrouter"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

// Claves y modelo exigidos por cada proveedor. Solo se valida el activo: con
// AI_PROVIDER=openrouter no hace falta tener una clave de Gemini, y al revés.
const PROVIDER_REQUIREMENTS = {
  claude: ["CLAUDE_API_KEY"],
  gemini: ["GEMINI_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"],
} as const satisfies Record<AiProvider, readonly string[]>;

const aiEnvSchema = z
  .object({
    AI_PROVIDER: z.enum(AI_PROVIDERS).default("claude"),
    CLAUDE_API_KEY: z.string().min(1).optional(),
    // El catálogo de Claude sí es estable, a diferencia del de OpenRouter, así que
    // sí lleva valor por defecto.
    CLAUDE_MODEL: z.string().min(1).default("claude-opus-5"),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    // Sin valor por defecto a propósito: el catálogo de OpenRouter cambia y un id
    // inventado fallaría con un 404 difícil de leer. Se elige en openrouter.ai/models.
    OPENROUTER_MODEL: z.string().min(1).optional(),
    AI_RATE_LIMIT_USER_PER_MIN: z.coerce.number().int().min(1).max(600).default(5),
    AI_RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().min(1).max(6000).default(6),
    AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN: z.coerce.number().int().min(1).max(6000).default(4),
  })
  .superRefine((env, ctx) => {
    for (const variable of PROVIDER_REQUIREMENTS[env.AI_PROVIDER]) {
      if (env[variable]) continue;
      ctx.addIssue({
        code: "custom",
        path: [variable],
        message: `Falta ${variable} para AI_PROVIDER=${env.AI_PROVIDER}.`,
      });
    }
  });

// Lazy for the same reason: without the provider key only the AI features degrade.
// Blank values (e.g. `GEMINI_MODEL=` in .env) fall back to the defaults.
export function getAiEnv() {
  const blankToUndefined = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

  return aiEnvSchema.parse({
    AI_PROVIDER: blankToUndefined(process.env.AI_PROVIDER),
    CLAUDE_API_KEY: blankToUndefined(process.env.CLAUDE_API_KEY),
    CLAUDE_MODEL: blankToUndefined(process.env.CLAUDE_MODEL),
    GEMINI_API_KEY: blankToUndefined(process.env.GEMINI_API_KEY),
    GEMINI_MODEL: blankToUndefined(process.env.GEMINI_MODEL),
    OPENROUTER_API_KEY: blankToUndefined(process.env.OPENROUTER_API_KEY),
    OPENROUTER_MODEL: blankToUndefined(process.env.OPENROUTER_MODEL),
    AI_RATE_LIMIT_USER_PER_MIN: blankToUndefined(process.env.AI_RATE_LIMIT_USER_PER_MIN),
    AI_RATE_LIMIT_GLOBAL_PER_MIN: blankToUndefined(process.env.AI_RATE_LIMIT_GLOBAL_PER_MIN),
    AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN: blankToUndefined(
      process.env.AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN,
    ),
  });
}

const emailEnvSchema = z.object({
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().min(1),
});

// Lazy for the same reason as getAiEnv: without a Resend key only email
// sending should degrade (sendEmail already swallows failures), not the app.
export function getEmailEnv() {
  return emailEnvSchema.parse({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  });
}
