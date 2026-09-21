"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/features/auth/actions";
import { PasswordField } from "@/features/auth/components/PasswordField";
import { PasswordStrength } from "@/features/auth/components/PasswordStrength";
import { isPasswordValid } from "@/features/auth/password-rules";

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  // Controlled so the live checks work and a server error keeps what was typed.
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const passwordsMatch = password === confirmPassword;
  const mismatch = confirmPassword.length > 0 && !passwordsMatch;
  const canSubmit = isPasswordValid(password) && passwordsMatch;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state?.email}
          required
        />
      </div>
      <div className="group/password flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordField
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-requirements"
          showLabel="Mostrar contraseña"
          hideLabel="Ocultar contraseña"
          required
        />
        <PasswordStrength password={password} requirementsId="password-requirements" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          aria-invalid={mismatch || undefined}
          aria-describedby="confirm-password-status"
          showLabel="Mostrar confirmación"
          hideLabel="Ocultar confirmación"
          required
        />
        <div id="confirm-password-status">
          {mismatch && (
            <p
              role="alert"
              className="text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none"
            >
              Las contraseñas no coinciden.
            </p>
          )}
          {canSubmit && confirmPassword.length > 0 && (
            <p
              role="status"
              className="flex items-center gap-1.5 text-sm text-success animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none"
            >
              <Check aria-hidden="true" className="size-4 shrink-0" />
              Las contraseñas coinciden
            </p>
          )}
        </div>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending || !canSubmit} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Crear cuenta
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-medium text-primary">
          Iniciá sesión
        </Link>
      </p>
    </form>
  );
}
