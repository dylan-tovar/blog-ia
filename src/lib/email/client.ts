import "server-only";
import { Resend } from "resend";
import { getEmailEnv } from "@/lib/env.server";

let cached: { key: string; client: Resend } | undefined;

export function getResendClient() {
  const env = getEmailEnv();

  if (!cached || cached.key !== env.RESEND_API_KEY) {
    cached = { key: env.RESEND_API_KEY, client: new Resend(env.RESEND_API_KEY) };
  }

  return { client: cached.client, from: env.RESEND_FROM_EMAIL };
}
