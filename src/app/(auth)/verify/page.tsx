import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { VerifyOtpForm } from "@/features/auth/components/VerifyOtpForm";
import { forgotPasswordSchema } from "@/features/auth/schemas";
import { getViewer } from "@/lib/viewer";

export default async function VerifyPage(props: PageProps<"/verify">) {
  const { email } = await props.searchParams;

  // Reuse the email-only schema: an invalid shape can never verify, so send
  // it back to /register instead of rendering a dead-end form.
  if (typeof email !== "string" || !forgotPasswordSchema.safeParse({ email }).success) {
    redirect("/register");
  }

  // A signed-in user reopening a stale verify link is already confirmed:
  // send them home and let the proxy gate route them (onboarding or not)
  // instead of showing a code form that can never succeed again.
  if (await getViewer()) {
    redirect("/");
  }

  return (
    <div className="flex min-h-svh flex-1 flex-col justify-between px-4 py-8 sm:px-8 max-w-md mx-auto w-full">
      <div className="flex flex-1 flex-col">
        <Link
          href="/register"
          className="inline-flex size-10 items-center justify-center rounded-md bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white transition-colors"
          aria-label="Volver al registro"
        >
          <ArrowLeft className="size-5" />
        </Link>

        <h1 className="mt-7 text-2xl font-bold text-white tracking-tight">Verificá tu correo</h1>
        <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
          Ingresá el código de 6 dígitos enviado a{" "}
          <strong className="font-medium text-neutral-200 break-all">{email}</strong>
        </p>

        <div className="mt-8 flex flex-1 flex-col">
          <VerifyOtpForm email={email} />
        </div>
      </div>
    </div>
  );
}
