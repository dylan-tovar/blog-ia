"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/features/auth/actions";
import { TurnstileWidget } from "@/features/auth/components/TurnstileWidget";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  // Turnstile tokens are single-use: a rejected submit leaves a spent token in
  // the DOM with no way to retry. Remounting forces a fresh one. Same pattern
  // as RegisterForm/LoginForm.
  const [prevState, setPrevState] = useState(state);
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  if (state !== prevState) {
    setPrevState(state);
    if (state?.error) setTurnstileAttempt((n) => n + 1);
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <TurnstileWidget key={turnstileAttempt} />
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full min-h-11 font-medium">
        {pending && <Loader2 className="animate-spin" />}
        Enviar código
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </form>
  );
}
