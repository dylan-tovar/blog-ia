"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrawerFooter } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/features/auth/actions";

interface LoginFormProps {
  redirectTo?: string;
  onRegisterClick?: () => void;
  inDrawer?: boolean;
}

export function LoginForm({ redirectTo, onRegisterClick, inDrawer = false }: LoginFormProps) {
  const [state, action, pending] = useActionState(signIn, undefined);

  const FooterWrapper = inDrawer ? DrawerFooter : "div";

  return (
    <form action={action} className="flex flex-col gap-4">
      {redirectTo && <input type="hidden" name="redirectTo" value={redirectTo} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="identifier">Email o usuario</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" required />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <FooterWrapper className={inDrawer ? "px-0 pt-1 pb-0 gap-3" : "flex flex-col gap-4"}>
        <Button type="submit" disabled={pending} className="w-full min-h-11 font-medium">
          {pending && <Loader2 className="animate-spin" />}
          Iniciar sesión
        </Button>
        {!inDrawer && (
          <p className="text-center text-sm text-muted-foreground">
            ¿No tenés cuenta?{" "}
            <Link
              href="/register"
              onClick={onRegisterClick}
              className="font-medium text-primary hover:underline"
            >
              Registrate
            </Link>
          </p>
        )}
      </FooterWrapper>
    </form>
  );
}
