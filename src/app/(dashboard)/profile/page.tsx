import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";

export default async function ProfileRedirectPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/login");
  }
  // No username yet (profile row missing it) shouldn't happen once past the
  // onboarding gate, but redirect there instead of producing a broken /null link.
  if (!viewer.username) {
    redirect("/onboarding");
  }
  redirect(`/${viewer.username}`);
}
