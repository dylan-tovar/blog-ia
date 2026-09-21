import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { getCurrentProfile } from "@/features/profile/actions";
import { OnboardingForm } from "@/features/profile/components/OnboardingForm";

export default async function OnboardingPage() {
  const { profile } = await getCurrentProfile();

  if (profile) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Completá tu perfil</CardTitle>
          <CardDescription>
            Un último paso para terminar de crear tu cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OnboardingForm />
          <form action={signOut} className="mt-4 text-center">
            <Button type="submit" variant="link" size="sm">
              Cerrar sesión
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
