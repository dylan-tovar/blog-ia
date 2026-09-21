"use server";

import { redirect } from "next/navigation";
import { getInterestOptions } from "@/features/interests/queries";
import { interestsSchema } from "@/features/interests/schemas";
import { planInterestChanges, validateSelection } from "@/features/interests/selection";
import { requireUser } from "@/lib/auth";

export type InterestsActionState = { error?: string } | undefined;

const SAVE_ERROR = "No pudimos guardar tus intereses. Intentá de nuevo.";

export async function saveInterests(
  _state: InterestsActionState,
  formData: FormData,
): Promise<InterestsActionState> {
  const parsed = interestsSchema.safeParse({ tagIds: formData.getAll("tagIds") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { supabase, user } = await requireUser();
  const { tagIds } = parsed.data;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, onboarded_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return { error: SAVE_ERROR };
  }
  // Step 1 is still pending, or this is a replay after finishing: the page decides.
  if (!profile) {
    redirect("/onboarding");
  }
  if (profile.onboarded_at !== null) {
    redirect("/");
  }

  // The eligible set is recomputed here: the client's list is never trusted.
  const eligible = await getInterestOptions();
  if (!eligible.ok) {
    return { error: "No pudimos cargar los temas. Intentá de nuevo." };
  }

  const invalid = validateSelection(
    tagIds,
    eligible.options.map(({ id }) => id),
  );
  if (invalid) {
    return { error: invalid };
  }

  const { data: current, error: currentError } = await supabase
    .from("user_interests")
    .select("tag_id")
    .eq("user_id", user.id);

  if (currentError) {
    return { error: SAVE_ERROR };
  }

  // Replace by diff so retries and resumes are safe: nothing is deleted just to be
  // re-inserted, and a double submit ignores rows that already exist.
  const { toAdd, toRemove } = planInterestChanges(
    (current ?? []).map(({ tag_id }) => tag_id),
    tagIds,
  );

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("user_interests")
      .delete()
      .eq("user_id", user.id)
      .in("tag_id", toRemove);

    if (error) {
      return { error: SAVE_ERROR };
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("user_interests")
      .upsert(
        toAdd.map((tag_id) => ({ user_id: user.id, tag_id })),
        { onConflict: "user_id,tag_id", ignoreDuplicates: true },
      );

    if (error) {
      return { error: SAVE_ERROR };
    }
  }

  const { error: doneError } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id)
    .is("onboarded_at", null);

  if (doneError) {
    return { error: SAVE_ERROR };
  }

  redirect("/");
}
