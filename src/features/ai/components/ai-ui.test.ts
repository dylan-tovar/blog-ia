import { describe, expect, it } from "vitest";
import { POST_CONTENT_MAX_LENGTH } from "@/features/posts/constants";
import {
  cleanTitles,
  describeAiError,
  featureAvailability,
  formatRetry,
  groupSuggestions,
  noPostIdError,
  outlineToMarkdown,
  scoreBand,
} from "./ai-ui";

describe("outlineToMarkdown", () => {
  it("emits H2 sections and H3 subsections separated by blank lines", () => {
    const markdown = outlineToMarkdown([
      { title: "Introducción", subsections: ["Contexto", "Objetivo"] },
      { title: "Cierre", subsections: [] },
    ]);

    expect(markdown).toBe("## Introducción\n\n### Contexto\n\n### Objetivo\n\n## Cierre\n");
  });

  it("never emits headings above H2", () => {
    const markdown = outlineToMarkdown([{ title: "Tema", subsections: ["Punto"] }]);

    expect(markdown).not.toMatch(/^#(?!#)/m);
  });

  it("strips heading markers, collapses whitespace and drops empty entries", () => {
    const markdown = outlineToMarkdown([
      { title: "  ## Uno\ndos  ", subsections: ["### Sub   uno", "   "] },
      { title: "   ", subsections: ["huérfana"] },
    ]);

    expect(markdown).toBe("## Uno dos\n\n### Sub uno\n");
  });

  it("returns an empty string when there is nothing to insert", () => {
    expect(outlineToMarkdown([])).toBe("");
  });
});

describe("cleanTitles", () => {
  it("trims, removes list numbering and surrounding quotes", () => {
    expect(cleanTitles(['  1. "Título uno"  ', "- Título dos", "3) Título tres"])).toEqual([
      "Título uno",
      "Título dos",
      "Título tres",
    ]);
  });

  it("dedupes case-insensitively and drops empty entries", () => {
    expect(cleanTitles(["Hola mundo", "hola MUNDO", "", "   "])).toEqual(["Hola mundo"]);
  });

  it("caps the list at the requested amount", () => {
    expect(cleanTitles(["a", "b", "c", "d", "e", "f", "g"], 5)).toHaveLength(5);
  });
});

describe("formatRetry", () => {
  it.each([
    [1, "1 s"],
    [45, "45 s"],
    [60, "1 min"],
    [75, "1 min 15 s"],
  ])("formats %i seconds as %s", (seconds, expected) => {
    expect(formatRetry(seconds)).toBe(expected);
  });
});

describe("describeAiError", () => {
  const rateLimited = {
    kind: "rate_limited" as const,
    message: "Estás generando muy rápido, esperá un momento e intentá de nuevo.",
    retryAfter: 12,
  };

  it("shows the countdown while waiting for a rate limit", () => {
    expect(describeAiError(rateLimited, 12)).toBe("Estás generando muy rápido, esperá 12 s.");
  });

  it("tells the user they can retry once the countdown ends", () => {
    expect(describeAiError(rateLimited, 0)).toBe("Ya podés intentar de nuevo.");
  });

  it("falls back to the server message when there is no countdown", () => {
    expect(describeAiError({ kind: "timeout", message: "La IA tardó demasiado." })).toBe(
      "La IA tardó demasiado.",
    );
  });

  it("does not show anything for a request the user cancelled", () => {
    expect(describeAiError({ kind: "aborted", message: "Cancelado" })).toBe("");
  });

  it("explains a request cancelled by another AI action instead of staying blank", () => {
    const message = describeAiError({ kind: "superseded", message: "x" });

    expect(message).toMatch(/otra acción de IA/i);
    expect(message).not.toBe("");
  });

  it("uses the saturation wording for a global rate limit countdown", () => {
    const message = describeAiError({ ...rateLimited, scope: "global" }, 8);

    expect(message).toBe("La IA está saturada en este momento, probá en 8 s.");
  });

  it("keeps the personal wording for a user rate limit countdown", () => {
    expect(describeAiError({ ...rateLimited, scope: "user" }, 8)).toBe("Estás generando muy rápido, esperá 8 s.");
  });
});

describe("featureAvailability", () => {
  it("always allows the outline generator", () => {
    expect(featureAvailability("outline", 0)).toEqual({ ok: true });
  });

  it.each([
    ["titles", 29, false],
    ["titles", 30, true],
    ["score", 79, false],
    ["score", 80, true],
    ["tone", 9, false],
    ["tone", 10, true],
  ] as const)("%s with %i words => ok: %s", (feature, words, ok) => {
    expect(featureAvailability(feature, words).ok).toBe(ok);
  });

  it("explains how many words are missing", () => {
    const result = featureAvailability("score", 20);

    expect(result).toEqual({ ok: false, hint: "Escribí al menos 80 palabras (tenés 20)." });
  });
});

describe("groupSuggestions", () => {
  it("groups by type in a fixed order and skips empty groups", () => {
    const groups = groupSuggestions([
      { type: "seo", text: "Agregá una descripción" },
      { type: "claridad", text: "Acortá el primer párrafo" },
      { type: "seo", text: "Usá palabras clave" },
    ]);

    expect(groups).toEqual([
      { type: "claridad", label: "Claridad", items: ["Acortá el primer párrafo"] },
      { type: "seo", label: "SEO", items: ["Agregá una descripción", "Usá palabras clave"] },
    ]);
  });

  it("returns an empty list when there are no suggestions", () => {
    expect(groupSuggestions([])).toEqual([]);
  });
});

describe("scoreBand", () => {
  it.each([
    [0, "low"],
    [39, "low"],
    [40, "medium"],
    [69, "medium"],
    [70, "high"],
    [100, "high"],
  ] as const)("score %i is %s", (score, band) => {
    expect(scoreBand(score)).toBe(band);
  });
});

describe("noPostIdError", () => {
  const fallback = { kind: "input_too_short" as const, message: "Escribí un poco más." };

  it("explains that the article is too long instead of asking for more text", () => {
    const error = noPostIdError("a".repeat(POST_CONTENT_MAX_LENGTH + 1), fallback);

    expect(error.kind).toBe("input_too_long");
    expect(error.message).toMatch(/demasiado largo/i);
  });

  it("returns the fallback when the article is within the limit", () => {
    expect(noPostIdError("texto", fallback)).toBe(fallback);
  });
});
