import { describe, expect, it } from "vitest";
import {
  interestCounterLabel,
  planInterestChanges,
  validateSelection,
} from "@/features/interests/selection";

const ids = (...names: string[]) => names;

const UNAVAILABLE =
  "Alguno de los temas ya no está disponible. Recargá la página y elegí de nuevo.";

describe("validateSelection", () => {
  const eligible = ids("a", "b", "c", "d");

  it("accepts a selection that meets the minimum and is eligible", () => {
    expect(validateSelection(ids("a", "b", "c"), eligible)).toBeNull();
  });

  it("rejects a selection below the minimum", () => {
    expect(validateSelection(ids("a", "b"), eligible)).toBe("Elegí al menos 3 temas.");
  });

  it("rejects ids that are not among the eligible tags", () => {
    expect(validateSelection(ids("a", "b", "zzz"), eligible)).toBe(UNAVAILABLE);
  });

  it("relaxes the minimum to the number of eligible tags", () => {
    expect(validateSelection(ids("a"), ids("a", "b"))).toBe("Elegí al menos 2 temas.");
    expect(validateSelection(ids("a", "b"), ids("a", "b"))).toBeNull();
    expect(validateSelection(ids("a"), ids("a"))).toBeNull();
  });

  it("uses the singular when a single tag is required", () => {
    expect(validateSelection([], ids("a"))).toBe("Elegí al menos 1 tema.");
  });

  it("accepts an empty selection when no tags exist", () => {
    expect(validateSelection([], [])).toBeNull();
  });

  it("rejects any selection when no tags exist", () => {
    expect(validateSelection(ids("a"), [])).toBe(UNAVAILABLE);
  });
});

describe("planInterestChanges", () => {
  it("adds everything on a first save", () => {
    expect(planInterestChanges([], ids("a", "b"))).toEqual({
      toAdd: ["a", "b"],
      toRemove: [],
    });
  });

  it("removes what is no longer selected and adds what is new", () => {
    expect(planInterestChanges(ids("a", "b"), ids("b", "c"))).toEqual({
      toAdd: ["c"],
      toRemove: ["a"],
    });
  });

  it("is a no-op when nothing changed (retry or resume)", () => {
    expect(planInterestChanges(ids("a", "b"), ids("b", "a"))).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  it("removes everything when the selection is empty", () => {
    expect(planInterestChanges(ids("a"), [])).toEqual({ toAdd: [], toRemove: ["a"] });
  });
});

describe("interestCounterLabel", () => {
  it("asks for the missing picks while under the minimum", () => {
    expect(interestCounterLabel(0, 3, 20)).toBe("Elegí al menos 3 · 0 elegidos");
    expect(interestCounterLabel(1, 3, 20)).toBe("Elegí al menos 3 · 1 elegido");
    expect(interestCounterLabel(2, 3, 20)).toBe("Elegí al menos 3 · 2 elegidos");
  });

  it("only counts once the minimum is met", () => {
    expect(interestCounterLabel(3, 3, 20)).toBe("3 elegidos");
    expect(interestCounterLabel(19, 3, 20)).toBe("19 elegidos");
  });

  it("says when the maximum was reached", () => {
    expect(interestCounterLabel(20, 3, 20)).toBe("20 elegidos · Llegaste al máximo");
  });

  it("follows a relaxed minimum", () => {
    expect(interestCounterLabel(0, 1, 20)).toBe("Elegí al menos 1 · 0 elegidos");
    expect(interestCounterLabel(1, 1, 20)).toBe("1 elegido");
  });
});
