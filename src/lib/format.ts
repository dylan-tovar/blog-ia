export function getInitials(name?: string | null) {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) {
    return "?";
  }

  return words.map((word) => Array.from(word)[0].toUpperCase()).join("");
}

export function formatShortDate(iso?: string | null, timeZone?: string) {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
}

export function formatRelativeDate(
  iso?: string | null,
  options?: { baseDate?: Date; timeZone?: string }
): string {
  if (!iso) {
    return "";
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = options?.baseDate ?? new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    return formatShortDate(iso, options?.timeZone);
  }

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) {
    return "recién";
  }
  if (diffMin < 60) {
    return `${diffMin}m`;
  }
  if (diffHours < 24) {
    return `${diffHours}h`;
  }
  if (diffDays === 1) {
    return "ayer";
  }
  if (diffDays < 7) {
    return `${diffDays}d`;
  }

  return formatShortDate(iso, options?.timeZone);
}
