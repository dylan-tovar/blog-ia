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

  it("accepts a selection of any size that is eligible (selection is optional)", () => {
    expect(validateSelection(ids("a", "b", "c"), eligible)).toBeNull();
    expect(validateSelection(ids("a", "b"), eligible)).toBeNull();
    expect(validateSelection(ids("a"), eligible)).toBeNull();
    expect(validateSelection([], eligible)).toBeNull();
  });

  it("rejects ids that are not among the eligible tags", () => {
    expect(validateSelection(ids("a", "b", "zzz"), eligible)).toBe(UNAVAILABLE);
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
  it("shows optional status when required is 0 and count is 0", () => {
    expect(interestCounterLabel(0, 0, 20)).toBe("0 elegidos (opcional)");
  });

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
