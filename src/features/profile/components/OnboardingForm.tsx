"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeOnboarding } from "@/features/profile/actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(completeOnboarding, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">Nombre para mostrar</Label>
        <Input
          id="displayName"
          name="displayName"
          type="text"
          autoComplete="name"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Nombre de usuario</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z0-9_]+"
          title="Entre 3 y 20 caracteres: letras, números o guion bajo."
          required
        />
        <p className="text-xs text-muted-foreground">
          3 a 20 caracteres: letras, números o guion bajo. Podés usarlo para iniciar sesión.
        </p>
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending && <Loader2 className="animate-spin" />}
        Continuar
      </Button>
    </form>
  );
}
