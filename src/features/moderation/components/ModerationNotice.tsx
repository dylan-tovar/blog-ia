import { ShieldAlert, TriangleAlert } from "lucide-react";
import { CATEGORY_HINTS, CATEGORY_LABELS } from "@/features/moderation/dictionary";
import type { ModerationSummary } from "@/features/moderation/scan";
import { cn } from "@/lib/utils";

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Indicador compacto para la barra del editor. No aparece si no hay coincidencias,
 * para no meter ruido en el caso normal.
 */
export function ModerationBadge({ summary }: { summary: ModerationSummary }) {
  if (summary.matches.length === 0) return null;

  const Icon = summary.blocked ? ShieldAlert : TriangleAlert;
  const label = summary.blocked
    ? `${summary.grave} ${plural(summary.grave, "término grave", "términos graves")}`
    : `${summary.leve} ${plural(summary.leve, "término para revisar", "términos para revisar")}`;

  return (
    <span
      role="status"
      aria-live="polite"
      title={
        summary.blocked
          ? "No vas a poder publicar hasta resolverlos. Abrí Continuar para ver cuáles son."
          : "Conviene revisarlos, pero no impiden publicar."
      }
      className={cn(
        "flex items-center gap-1.5 text-sm",
        summary.blocked ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </span>
  );
}

/**
 * Detalle para el diálogo de publicación: qué se encontró y dónde mirar. Muestra el
 * fragmento tal como aparece en el texto, que es lo que el autor tiene que buscar.
 */
export function ModerationDetails({ summary }: { summary: ModerationSummary }) {
  if (summary.matches.length === 0) return null;

  return (
    <div
      role={summary.blocked ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-2 rounded-md p-3 text-sm",
        summary.blocked ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground",
      )}
    >
      <p className="font-medium">
        {summary.blocked
          ? "No se puede publicar con este contenido"
          : "Hay términos que conviene revisar"}
      </p>

      {summary.categories.map((category) => {
        const found = summary.matches.filter((match) => match.category === category);
        // Un mismo término repetido se muestra una vez: lo que importa es cuál es.
        const excerpts = [...new Set(found.map((match) => match.excerpt.trim()))];

        return (
          <div key={category} className="flex flex-col gap-1">
            <p className="font-medium">{CATEGORY_LABELS[category]}</p>
            <p className="opacity-80">{CATEGORY_HINTS[category]}</p>
            <p className="flex flex-wrap gap-1.5">
              {excerpts.map((excerpt) => (
                <span key={excerpt} className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono text-xs">
                  {excerpt}
                </span>
              ))}
            </p>
          </div>
        );
      })}

      {summary.blocked && (
        <p className="opacity-80">
          Editá esos fragmentos y volvé a intentarlo. Si son parte de una cita o del tema del
          artículo, reformulá la frase para que no queden como una afirmación propia.
        </p>
      )}
    </div>
  );
}
