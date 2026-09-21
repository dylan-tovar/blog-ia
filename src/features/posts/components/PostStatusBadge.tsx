import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  pending_review: "En revisión",
  published: "Publicado",
  rejected: "Rechazado",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-amber-500/15 text-amber-300",
  published: "bg-green-500/15 text-green-300",
  rejected: "bg-red-500/15 text-red-300",
};

export function PostStatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_CLASSES[status] ?? ""} variant="secondary">
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}
