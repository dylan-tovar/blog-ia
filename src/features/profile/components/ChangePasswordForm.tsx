"use client";

import { useActionState, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { changePassword } from "@/features/auth/actions";
import { PasswordField } from "@/features/auth/components/PasswordField";
import { PasswordStrength } from "@/features/auth/components/PasswordStrength";
import { isPasswordValid } from "@/features/auth/password-rules";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);

  const passwordsMatch = newPassword === confirmNewPassword;
  const mismatch =
    confirmNewPassword.length > 0 &&
    !passwordsMatch &&
    (confirmTouched || confirmNewPassword.length >= newPassword.length);
  const canSubmit = isPasswordValid(newPassword) && passwordsMatch;

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="currentPassword">Contraseña actual</Label>
        <PasswordField
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          showLabel="Mostrar contraseña"
          hideLabel="Ocultar contraseña"
          required
        />
      </div>
      <div className="group/password flex flex-col gap-1.5">
        <Label htmlFor="newPassword">Nueva contraseña</Label>
        <PasswordField
          id="newPassword"
          name="newPassword"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-describedby="new-password-requirements"
          showLabel="Mostrar contraseña"
          hideLabel="Ocultar contraseña"
          required
        />
        <PasswordStrength password={newPassword} requirementsId="new-password-requirements" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirmNewPassword">Confirmar nueva contraseña</Label>
        <PasswordField
          id="confirmNewPassword"
          name="confirmNewPassword"
          value={confirmNewPassword}
          onChange={(e) => setConfirmNewPassword(e.target.value)}
          onBlur={() => setConfirmTouched(true)}
          aria-invalid={mismatch || undefined}
          aria-describedby="confirm-new-password-status"
          showLabel="Mostrar confirmación"
          hideLabel="Ocultar confirmación"
          required
        />
        <div id="confirm-new-password-status">
          {mismatch && (
            <p role="alert" className="text-sm text-destructive">
              Las contraseñas no coinciden.
            </p>
          )}
          {canSubmit && confirmNewPassword.length > 0 && (
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
      {state?.success && (
        <p role="status" className="text-sm text-success">
          Contraseña actualizada.
        </p>
      )}
      <Button type="submit" disabled={pending || !canSubmit} className="w-full min-h-11 font-medium">
        {pending && <Loader2 className="animate-spin" />}
        Actualizar contraseña
      </Button>
    </form>
  );
}
