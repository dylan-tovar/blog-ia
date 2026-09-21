"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "@/features/auth/actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(signUp, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="displayName">Nombre para mostrar</Label>
        <Input id="displayName" name="displayName" type="text" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="username">Nombre de usuario</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
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
