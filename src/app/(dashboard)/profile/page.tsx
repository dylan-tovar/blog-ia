import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";

export default async function ProfileRedirectPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/login");
  }
  redirect(`/author/${viewer.id}`);
}
