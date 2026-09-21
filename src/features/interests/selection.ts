import { requiredInterestCount } from "@/features/interests/constants";

// Error message for a selection that cannot be saved, or null when it is valid.
// `eligibleIds` are the tags offered by the server right now.
export function validateSelection(tagIds: string[], eligibleIds: string[]): string | null {
  const eligible = new Set(eligibleIds);

  if (!tagIds.every((id) => eligible.has(id))) {
    return "Alguno de los temas ya no está disponible. Recargá la página y elegí de nuevo.";
  }

  const required = requiredInterestCount(eligible.size);
  if (tagIds.length < required) {
    return `Elegí al menos ${required} ${required === 1 ? "tema" : "temas"}.`;
  }

  return null;
}

// Rows to insert and delete so the stored interests match the selection.
export function planInterestChanges(current: string[], selected: string[]) {
  const currentSet = new Set(current);
  const selectedSet = new Set(selected);

  return {
    toAdd: selected.filter((id) => !currentSet.has(id)),
    toRemove: current.filter((id) => !selectedSet.has(id)),
  };
}
