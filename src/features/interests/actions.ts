"use server";

import { redirect } from "next/navigation";
import { getInterestOptions } from "@/features/interests/queries";
import { interestsSchema } from "@/features/interests/schemas";
import { planInterestChanges, validateSelection } from "@/features/interests/selection";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type InterestsActionState = { error?: string } | undefined;

const SAVE_ERROR = "No pudimos guardar tus intereses. Intentá de nuevo.";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Replaces the stored interests by diff so retries and resumes are safe: nothing is
// deleted just to be re-inserted, and a double submit ignores rows that already exist.
// Shared by `saveInterests` (onboarding, with redirect) and `updateInterests` (sidebar,
// without it).
async function applyInterestChanges(
  supabase: SupabaseClient,
  userId: string,
  tagIds: string[],
): Promise<string | null> {
  const { data: current, error: currentError } = await supabase
    .from("user_interests")
    .select("tag_id")
    .eq("user_id", userId);

  if (currentError) {
    return SAVE_ERROR;
  }

  const { toAdd, toRemove } = planInterestChanges(
    (current ?? []).map(({ tag_id }) => tag_id),
    tagIds,
  );

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("user_interests")
      .delete()
      .eq("user_id", userId)
      .in("tag_id", toRemove);

    if (error) {
      return SAVE_ERROR;
    }
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("user_interests")
      .upsert(
        toAdd.map((tag_id) => ({ user_id: userId, tag_id })),
        { onConflict: "user_id,tag_id", ignoreDuplicates: true },
      );

    if (error) {
      return SAVE_ERROR;
    }
  }

  return null;
}

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

  const applyError = await applyInterestChanges(supabase, user.id, tagIds);
  if (applyError) {
    return { error: applyError };
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

// Same diff/upsert/delete as `saveInterests`, for editing interests from the sidebar
// after onboarding: no `onboarded_at` gate, no redirect, and no minimum interest count.
export async function updateInterests(tagIds: string[]): Promise<InterestsActionState> {
  const parsed = interestsSchema.safeParse({ tagIds });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const { supabase, user } = await requireUser();

  if (parsed.data.tagIds.length > 0) {
    const { data: validTags, error: tagError } = await supabase
      .from("tags")
      .select("id")
      .in("id", parsed.data.tagIds);

    if (tagError || !validTags || validTags.length !== parsed.data.tagIds.length) {
      return { error: "Alguno de los temas ya no está disponible. Recargá la página y elegí de nuevo." };
    }
  }

  const applyError = await applyInterestChanges(supabase, user.id, parsed.data.tagIds);
  if (applyError) {
    return { error: applyError };
  }

  return {};
}
