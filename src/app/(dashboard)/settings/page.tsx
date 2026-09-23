import { getCurrentProfile } from "@/features/profile/actions";
import { AccountSettings } from "@/features/profile/components/AccountSettings";
import { getAllInterestOptions, getUserInterests } from "@/features/interests/queries";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const { user, profile } = await getCurrentProfile();
  const supabase = await createClient();

  const [{ count }, userInterests, availableOptions] = await Promise.all([
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", user.id)
      .eq("type", "article"),
    getUserInterests(user.id),
    getAllInterestOptions(),
  ]);

  return (
    <AccountSettings
      user={user}
      profile={profile}
      postCount={count ?? 0}
      initialInterests={userInterests}
      availableOptions={availableOptions}
    />
  );
}
