import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { getOnboardingState } from "@/features/auth/onboarding-gate";
import { InterestsForm } from "@/features/interests/components/InterestsForm";
import { InterestsLoadError } from "@/features/interests/components/InterestsLoadError";
import { getInterestOptions, getUserInterestIds } from "@/features/interests/queries";
import { getCurrentProfile } from "@/features/profile/actions";
import { OnboardingForm } from "@/features/profile/components/OnboardingForm";
import { OnboardingSteps } from "@/features/profile/components/OnboardingSteps";
import { cn } from "@/lib/utils";

const ENTER_ANIMATION =
  "animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none";

// One URL for both steps: the database state (profile, onboarded_at) picks which
// one to show, so a refresh or a returning user always resumes where they left.
export default async function OnboardingPage() {
  const { user, profile } = await getCurrentProfile();
  const state = getOnboardingState(profile);

  if (state === "done") {
    redirect("/");
  }

  const step = state === "none" ? 1 : 2;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 short:py-4">
      <Card className={cn("w-full", step === 1 ? "max-w-sm" : "max-w-lg")}>
        <CardHeader>
          <OnboardingSteps current={step} />
        </CardHeader>
        <CardContent>
          {step === 1 ? <StepProfile /> : <StepInterests userId={user.id} />}
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

function StepProfile() {
  return (
    <div key="profile" className={cn("flex flex-col gap-4", ENTER_ANIMATION)}>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-base leading-snug font-medium">Completá tu perfil</h1>
        <p className="text-sm text-muted-foreground">Contanos quién sos.</p>
      </div>
      <OnboardingForm />
    </div>
  );
}

async function StepInterests({ userId }: { userId: string }) {
  const [options, selectedIds] = await Promise.all([
    getInterestOptions(),
    getUserInterestIds(userId),
  ]);

  return (
    <div key="interests" className={cn("flex flex-col gap-4", ENTER_ANIMATION)}>
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-base leading-snug font-medium">
          Elegí tus temas de interés
        </h1>
        <p className="text-sm text-muted-foreground">
          Usamos tus temas para recomendarte artículos desde el primer día.
        </p>
      </div>
      {options.ok ? (
        <InterestsForm
          options={options.options}
          initialSelectedIds={selectedIds.filter((id) =>
            options.options.some((option) => option.id === id),
          )}
        />
      ) : (
        <InterestsLoadError />
      )}
    </div>
  );
}
