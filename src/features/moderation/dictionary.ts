// Diccionario determinista de moderación, usado mientras se escribe un artículo.
// No reemplaza a la moderación con IA del momento de publicar: la complementa con
// una señal inmediata, gratuita y explicable, que le dice al autor exactamente qué
// término disparó el aviso. La IA sigue siendo la que juzga el contenido completo.
//
// **Criterio de inclusión.** Un término de severidad `grave` impide publicar, así
// que un falso positivo le bloquea el trabajo a alguien. Por eso solo entra lo que
// es inequívocamente un insulto o una agresión en cualquier contexto. Queda fuera
// toda palabra que también tenga un uso corriente: "negro" (color y trato afectivo
// en el Caribe), "coño" (interjección habitual en Venezuela), "arrecho" (molesto o
// excelente, según la región), "basura" o "vaina". Incluirlas haría inusable el
// editor para quien escribe en español venezolano.
//
// **Coloquialismos degradados a `leve`.** "marico" y "marica" funcionan en Venezuela
// como muletilla entre amigos; siguen siendo ofensivos en otros contextos, así que
// avisan pero no bloquean. "maricón" sí es inequívocamente peyorativo.
//
// **Limitaciones conocidas.** Una lista de términos es evadible (el escáner tolera
// acentos, mayúsculas, repeticiones, separadores y sustituciones tipo 4 por a, pero
// no cubre toda variante posible) y no entiende el contexto: una cita textual, un
// artículo periodístico sobre discurso de odio o un texto académico pueden disparar
// un aviso legítimo. Esa es la razón de que la IA, que sí lee el contexto, siga
// siendo la puerta de la publicación.

export type ModerationCategory = "odio" | "amenaza" | "insulto";
export type ModerationSeverity = "grave" | "leve";

export const CATEGORY_SEVERITY: Record<ModerationCategory, ModerationSeverity> = {
  odio: "grave",
  amenaza: "grave",
  insulto: "leve",
};

export const CATEGORY_LABELS: Record<ModerationCategory, string> = {
  odio: "Odio y discriminación",
  amenaza: "Amenaza o daño a una persona",
  insulto: "Insulto o descalificación",
};

// Qué le explica el aviso al autor sobre cada categoría.
export const CATEGORY_HINTS: Record<ModerationCategory, string> = {
  odio: "Ataca a una persona o a un grupo por su origen, etnia, religión, orientación sexual, identidad de género o discapacidad.",
  amenaza: "Anuncia violencia contra una persona o la incita a hacerse daño.",
  insulto: "Descalifica a una persona. No impide publicar, pero conviene revisarlo.",
};

// Discurso de odio: insultos dirigidos a una condición de la persona, e incitación
// explícita contra un grupo. Ver el criterio de inclusión arriba.
const ODIO = [
  "maricon",
  "mariconazo",
  "marimacho",
  "joto",
  "tortillera",
  "travelo",
  "sudaca",
  "panchito",
  "negrata",
  "mongolico",
  "retrasado mental",
  "subnormal",
  // Patrón de desprecio por origen o credo. Se listan completos, no por la palabra
  // suelta, porque "judío", "gitano" o "indio" son palabras normales.
  "negro de mierda",
  "indio de mierda",
  "gitano de mierda",
  "judio de mierda",
  "moro de mierda",
  "sudaca de mierda",
  // Incitación explícita.
  "muerte a los",
  "hay que matar a los",
  "hay que exterminar",
  "no merecen vivir",
  "raza inferior",
  "limpieza etnica",
];

// Amenazas y daño a una persona, incluida la inducción al suicidio. Se listan como
// frases: el verbo suelto ("matar") aparece en cualquier texto legítimo.
const AMENAZA = [
  "te voy a matar",
  "voy a matarte",
  "te voy a reventar",
  "te voy a partir la cara",
  "te voy a romper la cara",
  "te voy a quemar",
  "te voy a buscar y te",
  "vas a morir",
  "ojala te mueras",
  "que te mueras",
  "deberias morirte",
  "deberia morirse",
  "matate",
  "suicidate",
  "anda a matarte",
  "se donde vivis",
  "se donde vives",
  "sabemos donde vivis",
  "sabemos donde vives",
];

// Insultos y descalificaciones. Avisan, no bloquean: son ofensivos pero no
// constituyen odio ni amenaza, y aparecen en registros informales legítimos.
const INSULTO = [
  "idiota",
  "imbecil",
  "estupido",
  "estupida",
  "tarado",
  "tarada",
  "cretino",
  "pendejo",
  "boludo",
  "pelotudo",
  "gilipollas",
  "hijo de puta",
  "hija de puta",
  "hijueputa",
  "malparido",
  "cabron",
  "puta",
  "puto",
  "zorra",
  "mamahuevo",
  "mamaguevo",
  "huevon",
  "guevon",
  "marico",
  "marica",
  "cono de tu madre",
  "cono e tu madre",
  "muerto de hambre",
  "bueno para nada",
];

export const DICTIONARY: Record<ModerationCategory, readonly string[]> = {
  odio: ODIO,
  amenaza: AMENAZA,
  insulto: INSULTO,
};

export const MODERATION_CATEGORIES = Object.keys(DICTIONARY) as ModerationCategory[];
