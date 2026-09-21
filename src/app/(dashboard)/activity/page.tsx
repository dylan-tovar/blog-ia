import { Bell } from "lucide-react";
import { getViewer } from "@/lib/viewer";
import { redirect } from "next/navigation";

export default async function ActivityPage() {
  const viewer = await getViewer();
  if (!viewer) {
    redirect("/login");
  }

  return (
    <>
      <h1 className="sr-only">Actividad</h1>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <div className="mb-4 grid size-12 place-items-center rounded-2xl bg-neutral-800/60 text-muted-foreground">
          <Bell className="size-6" aria-hidden />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          No tenés actividad reciente
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Cuando otros usuarios le den me gusta a tus publicaciones, dejen notas o te sigan, lo verás acá.
        </p>
      </div>
    </>
  );
}
