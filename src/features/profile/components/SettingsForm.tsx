"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/features/profile/actions";

interface SettingsFormProps {
  initialDisplayName: string;
  initialUsername: string;
}

export function SettingsForm({
  initialDisplayName,
  initialUsername,
}: SettingsFormProps) {
  const [state, action, pending] = useActionState(updateProfile, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">Nombre para mostrar</Label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          defaultValue={initialDisplayName}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Nombre de usuario</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoCapitalize="none"
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          title="Entre 3 y 20 caracteres: letras, números o guion bajo."
          defaultValue={initialUsername}
          required
        />
        <p className="text-xs text-muted-foreground">
          También sirve para iniciar sesión.
        </p>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state?.success && (
        <p className="text-sm text-green-400">Perfil actualizado.</p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Guardar cambios
      </Button>
    </form>
  );
}
