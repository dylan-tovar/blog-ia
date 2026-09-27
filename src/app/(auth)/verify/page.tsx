import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VerifyOtpForm } from "@/features/auth/components/VerifyOtpForm";
import { forgotPasswordSchema } from "@/features/auth/schemas";
import { getViewer } from "@/lib/viewer";

const COPY = {
  signup: {
    backHref: "/register",
    backLabel: "Volver al registro",
    title: "Verificá tu correo",
    description: "Ingresá el código de 6 dígitos enviado a",
  },
  recovery: {
    backHref: "/forgot-password",
    backLabel: "Volver a recuperar contraseña",
    title: "Recuperá tu contraseña",
    description: "Ingresá el código de 6 dígitos que enviamos a",
  },
} as const;

export default async function VerifyPage(props: PageProps<"/verify">) {
  const { email, type } = await props.searchParams;
  const verifyType = type === "recovery" ? "recovery" : "signup";
  const copy = COPY[verifyType];

  // Reuse the email-only schema: an invalid shape can never verify, so send
  // it back instead of rendering a dead-end form.
  if (typeof email !== "string" || !forgotPasswordSchema.safeParse({ email }).success) {
    redirect(copy.backHref);
  }

  // A signed-in user reopening a stale signup verify link is already
  // confirmed: send them home and let the proxy gate route them (onboarding
  // or not) instead of showing a code form that can never succeed again.
  // Recovery has no such guarantee — a still-logged-in user can legitimately
  // be resetting their password (e.g. from another device/tab).
  if (verifyType === "signup" && (await getViewer())) {
    redirect("/");
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col justify-between px-4 py-8 sm:px-8 max-w-md mx-auto w-full">
      <div className="flex flex-1 flex-col">
        <Link
          href={copy.backHref}
          className="inline-flex size-10 items-center justify-center rounded-md bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label={copy.backLabel}
        >
          <ArrowLeft className="size-5" />
        </Link>

        <h1 className="mt-7 text-2xl font-bold text-white tracking-tight">{copy.title}</h1>
        <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
          {copy.description}{" "}
          <strong className="font-medium text-neutral-200 break-all">{email}</strong>
        </p>

        <div className="mt-8 flex flex-1 flex-col">
          <VerifyOtpForm email={email} verifyType={verifyType} />
        </div>
      </div>
    </div>
  );
}
