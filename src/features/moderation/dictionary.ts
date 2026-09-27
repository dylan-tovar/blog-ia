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

export type ModerationCategory = "odio" | "amenaza" | "insulto" | "vulgaridad";
export type ModerationSeverity = "grave" | "leve";

export const CATEGORY_SEVERITY: Record<ModerationCategory, ModerationSeverity> = {
  odio: "grave",
  amenaza: "grave",
  insulto: "leve",
  vulgaridad: "leve", // Avisa pero no bloquea
};

export const CATEGORY_LABELS: Record<ModerationCategory, string> = {
  odio: "Odio y discriminación",
  amenaza: "Amenaza o daño a una persona",
  insulto: "Insulto o descalificación",
  vulgaridad: "Lenguaje vulgar o malsonante",
};

// Qué le explica el aviso al autor sobre cada categoría.
export const CATEGORY_HINTS: Record<ModerationCategory, string> = {
  odio: "Ataca a una persona o a un grupo por su origen, etnia, religión, orientación sexual, identidad de género o discapacidad.",
  amenaza: "Anuncia violencia contra una persona o la incita a hacerse daño.",
  insulto: "Descalifica a una persona. No impide publicar, pero conviene revisarlo.",
  vulgaridad: "Expresiones malsonantes o soeces. No impiden publicar, pero se sugiere mantener un tono respetuoso.",
};

// --- GENERACIÓN COMBINATORIA PARA DISCURSO DE ODIO ---
// Identidades que por sí solas no son ofensivas (o pueden ser reapropiadas)
const IDENTIDADES = [
  "judio", "judia", "judios", "judias",
  "gitano", "gitana", "gitanos", "gitanas",
  "indio", "india", "indios", "indias",
  "negro", "negra", "negros", "negras",
  "moro", "mora", "moros", "moras",
  "sudaca", "sudacas", "panchito", "panchitos",
  "veneco", "venecos", "gallego", "gallegos",
  "autista", "autistas", "sindromico",
  "sidoso", "sidosa", "sidosos",
  "marica", "maricas", "gay", "gays", "lesbiana", "lesbianas"
];

// Adjetivos descalificativos que combinados con identidades forman discurso de odio
const DESCALIFICATIVOS_ODIO = [
  "de mierda", "asqueroso", "asquerosa", "asquerosos", "asquerosas",
  "maldito", "maldita", "malditos", "malditas",
  "sucio", "sucia", "sucios", "sucias",
  "puto", "puta", "putos", "putas",
  "inmundo", "inmunda", "inmundos", "inmundas",
  "roñoso", "roñosa", "roñosos", "roñosas",
  "basura", "muerto de hambre", "muertos de hambre",
  "apestoso", "apestosa", "apestosos", "apestosas",
  "inferior", "inferiores"
];

// Genera combinaciones: "judio asqueroso" y "maldito judio"
const ODIO_COMBINADO = IDENTIDADES.flatMap(identidad => 
  DESCALIFICATIVOS_ODIO.flatMap(insulto => [
    `${identidad} ${insulto}`,
    `${insulto} ${identidad}`
  ])
);

// Discurso de odio: insultos que son explícitamente ofensivos sin necesidad de combinación
const ODIO_EXPLICITO = [
  "maricon", "mariconazo", "marimacho", "joto", "tortillera", "travelo",
  "negrata", "mongolico", "retrasado mental", "subnormal",
  // Incitación explícita
  "muerte a los", "hay que matar a los", "hay que exterminar",
  "no merecen vivir", "raza inferior", "limpieza etnica"
];

// Unificamos las combinaciones dinámicas con los explícitos
const ODIO = [...ODIO_EXPLICITO, ...ODIO_COMBINADO];

// Amenazas y daño a una persona, incluida la inducción al suicidio. Se listan como
// frases: el verbo suelto ("matar") aparece en cualquier texto legítimo.
const AMENAZA = [
  "te voy a matar", "voy a matarte", "te voy a reventar",
  "te voy a partir la cara", "te voy a romper la cara", "te voy a quemar",
  "te voy a buscar y te", "vas a morir", "ojala te mueras", "que te mueras",
  "deberias morirte", "deberia morirse", "matate", "suicidate", "anda a matarte",
  "se donde vivis", "se donde vives", "sabemos donde vivis", "sabemos donde vives",
  "tengo tu direccion", "voy a publicar tu direccion",
  "le va a pasar algo a tu familia", "algo le va a pasar a tu familia"
];

// Insultos y descalificaciones. Avisan, no bloquean: son ofensivos pero no
// constituyen odio ni amenaza, y aparecen en registros informales legítimos.
const INSULTO = [
  "idiota", "imbecil", "estupido", "estupida", "tarado", "tarada",
  "cretino", "cretina", "pendejo", "pendeja", "boludo", "boluda",
  "pelotudo", "pelotuda", "gilipollas", "hijo de puta", "hija de puta",
  "hijueputa", "hijodeputa", "malparido", "malparida", "cabron", "cabrona", "puta", "puto", "putas", "putos",
  "maldito", "maldita", "malditos", "malditas", "desgraciado", "desgraciada", "desgraciados", "desgraciadas",
  "zorra", "perra", // Uso literal animal, pero muy usados como insulto (avisan)
  "mamahuevo", "mamaguevo", "huevon", "guevon",
  "marico", "marica", // Uso como muletilla (avisan, no bloquean)
  "cono de tu madre", "cono e tu madre", "coño de tu madre", "coño e tu madre",
  "muerto de hambre", "bueno para nada",
  "soplapollas", "tuercebotas", "comeculos", "lameculos", "chupapollas",
  "come mierda", "comemierda", "caraculo", "cabezon", "pagafantas"
];

// Lenguaje vulgar o malsonante. No está dirigido necesariamente a descalificar a una
// persona (como el insulto), sino que son expresiones soeces que podrían no encajar
// con el tono profesional o público del blog.
const VULGARIDAD = [
  "mierda", "joder", "cojones", "hostia", "hostias",
  "puta madre", "putamadre", "la puta que te pario", "me cago en",
  "carajo", "verga", "pija", "polla", "pinga",
  "culo", "ojete", "cabronada", "pendejada", "gilipollez",
  "huevada", "mamada", "chingada", "chingar", "pinche",
  "puñeta", "puñetero", "puñetera", "tocapelotas",
  "me suda la", "me chupa un"
];

export const DICTIONARY: Record<ModerationCategory, readonly string[]> = {
  odio: ODIO,
  amenaza: AMENAZA,
  insulto: INSULTO,
  vulgaridad: VULGARIDAD,
};

export const MODERATION_CATEGORIES = Object.keys(DICTIONARY) as ModerationCategory[];
