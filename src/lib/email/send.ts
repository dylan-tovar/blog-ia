import "server-only";
import { getResendClient } from "./client";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = { ok: true } | { ok: false; error: unknown };

// Best-effort on purpose: every caller (welcome email, new-article fanout)
// must be able to fire this without risking the action/route that triggered
// it. A missing RESEND_API_KEY or a Resend API error is logged, never thrown.
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  try {
    const { client, from } = getResendClient();
    const { error } = await client.emails.send({ from, to, subject, html });

    if (error) {
      console.error("[email] send failed", { to, subject, error });
      return { ok: false, error };
    }

    return { ok: true };
  } catch (error) {
    console.error("[email] send threw", { to, subject, error });
    return { ok: false, error };
  }
}
