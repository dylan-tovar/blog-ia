"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/features/auth/actions";
import { PasswordField } from "@/features/auth/components/PasswordField";
import { PasswordStrength } from "@/features/auth/components/PasswordStrength";
import { isPasswordValid } from "@/features/auth/password-rules";

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  // Same controlled pattern as RegisterForm: live checks + keep server errors legible.
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);

  const passwordsMatch = password === confirmPassword;
  const mismatch =
    confirmPassword.length > 0 &&
    !passwordsMatch &&
    (confirmTouched || confirmPassword.length >= password.length);
  const canSubmit = isPasswordValid(password) && passwordsMatch;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="group/password flex flex-col gap-1.5">
        <Label htmlFor="password">Nueva contraseña</Label>
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
          onBlur={() => setConfirmTouched(true)}
          aria-invalid={mismatch || undefined}
          aria-describedby="confirm-password-status"
          showLabel="Mostrar confirmación"
          hideLabel="Ocultar confirmación"
          required
        />
        <div id="confirm-password-status">
          {mismatch && (
            <p role="alert" className="text-sm text-destructive">
              Las contraseñas no coinciden.
            </p>
          )}
          {canSubmit && confirmPassword.length > 0 && (
            <p role="status" className="flex items-center gap-1.5 text-sm text-success">
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
      <Button type="submit" disabled={pending || !canSubmit} className="w-full min-h-11 font-medium">
        {pending && <Loader2 className="animate-spin" />}
        Actualizar contraseña
      </Button>
    </form>
  );
}
