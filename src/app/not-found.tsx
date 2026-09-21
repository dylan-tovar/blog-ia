import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Página no encontrada</h1>
      <p className="text-sm text-muted-foreground">
        El contenido que buscás no existe o no está disponible.
      </p>
      <Button render={<Link href="/" />}>Volver al inicio</Button>
    </div>
  );
}
