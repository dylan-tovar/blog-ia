import {
  CATEGORY_SEVERITY,
  DICTIONARY,
  MODERATION_CATEGORIES,
  type ModerationCategory,
  type ModerationSeverity,
} from "./dictionary";

// Escáner del diccionario de moderación. Módulo puro y sin I/O, para poder probarlo
// sin red ni navegador, como el resto de la lógica de la capa de IA.

export type ModerationMatch = {
  /** El término del diccionario que coincidió, ya normalizado. */
  term: string;
  category: ModerationCategory;
  severity: ModerationSeverity;
  /** Posición en el texto original, para poder señalar el fragmento. */
  start: number;
  end: number;
  /** Lo que apareció de verdad en el texto, con su forma original. */
  excerpt: string;
};

// Sustituciones que se usan para esquivar filtros. Solo se aplican dentro de una
// palabra: un "4" suelto es un número, no una "a".
const LEET: Record<string, string> = {
  "4": "a",
  "@": "a",
  "3": "e",
  "1": "i",
  "!": "i",
  "|": "i",
  "0": "o",
  "5": "s",
  $: "s",
  "7": "t",
};

// Separadores que alguien intercala para partir una palabra: p-u-t-a, p.u.t.a.
// Como máximo dos seguidos, para no encadenar palabras distintas de una frase.
const BETWEEN_LETTERS = "[\\s._\\-*·,'\"]{0,2}";
const BETWEEN_WORDS = "[\\s._\\-]+";

// Lookarounds en vez de \b: \b considera límite cualquier cosa que no sea [A-Za-z0-9],
// así que "ñ" o una vocal acentuada partirían la palabra. Requiere lookbehind, que
// tienen todos los navegadores desde 2023 y el editor es solo de escritorio.
const BOUNDARY_BEFORE = "(?<![\\p{L}\\p{N}])";
const BOUNDARY_AFTER = "(?![\\p{L}\\p{N}])";

const isLetter = (char: string | undefined) => char !== undefined && /\p{L}/u.test(char);

const escapeRegExp = (char: string) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Pasa el texto a minúsculas y sin acentos, y devuelve además la correspondencia
 * de cada carácter con su posición en el texto original, para poder informar dónde
 * está el término aunque la normalización cambie la longitud.
 */
export function normalize(text: string): { text: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];

  for (let index = 0; index < text.length; ) {
    const char = String.fromCodePoint(text.codePointAt(index)!);
    // NFD separa la tilde del carácter y \p{M} la descarta: "ñ" queda "n", "é" queda "e".
    const plain = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

    for (const piece of plain) {
      chars.push(piece);
      map.push(index);
    }

    index += char.length;
  }

  // Se procesa por corridas, no carácter por carácter: en "35tup1d0" el "3" inicial
  // no tiene una letra a su izquierda todavía convertida, pero sí la tiene la corrida
  // completa "35" si se la mira como un bloque (su vecino derecho, "t", es letra).
  for (let index = 0; index < chars.length; ) {
    const replacement = LEET[chars[index]];
    if (!replacement) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < chars.length && LEET[chars[end]]) end += 1;

    if (isLetter(chars[index - 1]) || isLetter(chars[end])) {
      for (let i = index; i < end; i += 1) chars[i] = LEET[chars[i]];
    }

    index = end;
  }

  return { text: chars.join(""), map };
}

// Un término se busca tolerando repeticiones ("puuuta") y separadores intercalados.
function termPattern(term: string): string {
  const chars = [...normalize(term).text];

  return chars
    .map((char, index) => {
      if (char === " ") return BETWEEN_WORDS;

      const repeated = `${escapeRegExp(char)}+`;
      const next = chars[index + 1];
      const needsSeparator = next !== undefined && next !== " ";
      return needsSeparator ? repeated + BETWEEN_LETTERS : repeated;
    })
    .join("");
}

type DictionaryEntry = { category: ModerationCategory; severity: ModerationSeverity; term: string };

// Todo el diccionario en una sola alternación, con los grupos con nombre identificando
// qué término coincidió: un solo recorrido del texto en vez de uno por categoría.
//
// El orden importa: la alternación regex toma la primera alternativa que matchea, no
// la más larga, así que los términos se ordenan por longitud normalizada descendente
// para que una frase ("sudaca de mierda") se pruebe antes que un término que empieza
// igual ("sudaca") y no quede tapada por él.
function buildDictionary(): { regex: RegExp; entries: DictionaryEntry[] } {
  const all = MODERATION_CATEGORIES.flatMap((category) =>
    DICTIONARY[category].map((term) => ({ category, severity: CATEGORY_SEVERITY[category], term })),
  );

  const entries = [...all].sort((a, b) => normalize(b.term).text.length - normalize(a.term).text.length);

  const alternation = entries.map((entry, index) => `(?<t${index}>${termPattern(entry.term)})`).join("|");
  // Plural español: "-s" tras vocal ("pendejos"), "-es" tras consonante ("imbeciles",
  // "cabrones"). Se prueba "es" primero porque la alternación se queda con la que matchea.
  const regex = new RegExp(`${BOUNDARY_BEFORE}(?:${alternation})(?:es|s)?${BOUNDARY_AFTER}`, "gu");

  return { regex, entries };
}

const { regex: DICTIONARY_REGEX, entries: DICTIONARY_ENTRIES } = buildDictionary();

const SEVERITY_ORDER: Record<ModerationSeverity, number> = { grave: 0, leve: 1 };

// Una frase y una de sus palabras pueden coincidir sobre el mismo fragmento
// ("hijo de puta" y "puta"): se informa la más grave y, a igual gravedad, la más
// larga, y se descartan las que quedan contenidas en ella.
function dropContained(matches: ModerationMatch[]): ModerationMatch[] {
  const ordered = [...matches].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  );

  const kept: ModerationMatch[] = [];
  for (const match of ordered) {
    const contained = kept.some((other) => match.start >= other.start && match.end <= other.end);
    if (!contained) kept.push(match);
  }

  return kept.sort((a, b) => a.start - b.start);
}

export function scanText(text: string): ModerationMatch[] {
  if (!text.trim()) return [];

  const { text: haystack, map } = normalize(text);
  const matches: ModerationMatch[] = [];

  DICTIONARY_REGEX.lastIndex = 0;
  for (const match of haystack.matchAll(DICTIONARY_REGEX)) {
    const groupName = Object.entries(match.groups ?? {}).find(([, value]) => value !== undefined)?.[0];
    if (!groupName) continue;

    const { category, severity, term } = DICTIONARY_ENTRIES[Number(groupName.slice(1))];
    const from = match.index;
    const to = from + match[0].length;

    const start = map[from] ?? 0;
    const end = to < map.length ? map[to] : text.length;

    matches.push({ term, category, severity, start, end, excerpt: text.slice(start, end) });
  }

  return dropContained(matches);
}

export type ModerationSummary = {
  matches: ModerationMatch[];
  grave: number;
  leve: number;
  /** Con al menos una coincidencia grave no se puede publicar. */
  blocked: boolean;
  /** Categorías presentes, para explicar el aviso sin repetir términos. */
  categories: ModerationCategory[];
};

export function summarize(matches: ModerationMatch[]): ModerationSummary {
  const grave = matches.filter((match) => match.severity === "grave").length;
  const categories = MODERATION_CATEGORIES.filter((category) =>
    matches.some((match) => match.category === category),
  );

  return { matches, grave, leve: matches.length - grave, blocked: grave > 0, categories };
}

export function scan(text: string): ModerationSummary {
  return summarize(scanText(text));
}

// Título y contenido se escanean por separado, nunca unidos con un separador: el
// separador de frases del diccionario ("[\s._-]+") matchea un salto de línea, así
// que una frase grave podría armarse cruzando el límite entre los dos campos aunque
// ninguno la contenga por sí solo.
export function scanArticle(title: string, content: string): ModerationSummary {
  return summarize([...scanText(title), ...scanText(content)]);
}
