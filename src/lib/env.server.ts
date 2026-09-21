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

const aiEnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
  AI_RATE_LIMIT_USER_PER_MIN: z.coerce.number().int().min(1).max(600).default(5),
  AI_RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().min(1).max(6000).default(6),
  AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN: z.coerce.number().int().min(1).max(6000).default(4),
});

// Lazy for the same reason: without a Gemini key only the AI features degrade.
// Blank values (e.g. `GEMINI_MODEL=` in .env) fall back to the defaults.
export function getAiEnv() {
  const blankToUndefined = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

  return aiEnvSchema.parse({
    GEMINI_API_KEY: blankToUndefined(process.env.GEMINI_API_KEY),
    GEMINI_MODEL: blankToUndefined(process.env.GEMINI_MODEL),
    AI_RATE_LIMIT_USER_PER_MIN: blankToUndefined(process.env.AI_RATE_LIMIT_USER_PER_MIN),
    AI_RATE_LIMIT_GLOBAL_PER_MIN: blankToUndefined(process.env.AI_RATE_LIMIT_GLOBAL_PER_MIN),
    AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN: blankToUndefined(
      process.env.AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN,
    ),
  });
}
