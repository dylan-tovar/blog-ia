// Keep in sync with `posts_cover_color_check` in supabase/migrations/0009_post_cover.sql.
export const COVER_COLORS = [
  "slate",
  "olive",
  "wine",
  "forest",
  "navy",
  "plum",
  "rust",
  "teal",
] as const;

export type CoverColor = (typeof COVER_COLORS)[number];

export const DEFAULT_COVER_COLOR: CoverColor = "slate";

export function isCoverColor(value: unknown): value is CoverColor {
  return typeof value === "string" && (COVER_COLORS as readonly string[]).includes(value);
}

// Full class names so Tailwind can see them; every background is dark enough for white text.
export const COVER_COLOR_STYLES: Record<CoverColor, { label: string; className: string }> = {
  slate: { label: "Pizarra", className: "bg-[#2f3640]" },
  olive: { label: "Oliva", className: "bg-[#3a3a2e]" },
  wine: { label: "Vino", className: "bg-[#5a2233]" },
  forest: { label: "Bosque", className: "bg-[#24402f]" },
  navy: { label: "Marino", className: "bg-[#1f2f52]" },
  plum: { label: "Ciruela", className: "bg-[#492a5c]" },
  rust: { label: "Óxido", className: "bg-[#6b3319]" },
  teal: { label: "Turquesa", className: "bg-[#1f4a4a]" },
};
