# 0032. Diccionario determinista de moderación mientras se escribe un artículo

- **Estado:** Aceptada. Complementa la moderación con IA del [ADR 0011](0011-ia-con-gemini.md) sin reemplazarla: la IA sigue siendo la que decide si un artículo se publica.
- **Fecha:** 2026-09-22
- **Fuentes:** [PRD-2](../prds/PRD-2-posts.md), [PRD-5](../prds/PRD-5-ai-author.md); `src/features/moderation/`, `src/features/posts/components/PostEditor.tsx`, `src/features/posts/actions.ts`

## Contexto

La única moderación del proyecto ocurría al publicar, con una llamada al modelo de lenguaje. Eso deja dos huecos mientras se escribe: el autor no tiene ninguna señal hasta que termina y aprieta publicar, y recién ahí descubre que su artículo fue rechazado, con un motivo redactado por el modelo que no siempre señala qué frase lo causó.

Un filtro de términos resuelve justo lo que la IA no: es inmediato, no consume cuota, es completamente explicable (dice qué palabra y dónde) y funciona sin conexión con el proveedor. Es el mismo razonamiento del [ADR 0004](0004-recomendaciones-scoring-determinista.md) para las recomendaciones: cuando el problema es de coincidencia y no de comprensión, un algoritmo determinista gana en velocidad, costo y explicabilidad.

## Decisión

### Alcance: el editor de artículos

Se revisa el **título y el contenido** mientras se escribe un artículo. No cubre notas, respuestas ni el texto de portada: fue el alcance pedido. La brecha legal de las notas sin moderación sigue abierta ([capítulo 4 del informe académico](../universidad/04-base-legal.md), brecha B1).

### Tres categorías, dos severidades

| Categoría | Severidad | Qué agrupa |
| :--- | :--- | :--- |
| Odio y discriminación | Grave | Ataques por origen, etnia, religión, orientación sexual, identidad de género o discapacidad, e incitación explícita contra un grupo |
| Amenaza o daño a una persona | Grave | Anuncio de violencia contra alguien e inducción al suicidio |
| Insulto o descalificación | Leve | Descalificaciones personales que no son odio ni amenaza |

La separación no es cosmética: la Ley de Responsabilidad Social en Medios Electrónicos (art. 27) y la Ley Constitucional contra el Odio hablan de odio e incitación, no de groserías. Tratar un insulto suelto como un delito de odio sería desproporcionado y volvería inusable el editor.

### Una coincidencia grave impide publicar; una leve solo avisa

El aviso aparece en la barra del editor con el conteo, y el diálogo de publicación lista los fragmentos encontrados agrupados por categoría para que el autor sepa qué buscar. Con al menos una coincidencia grave, el botón de publicar queda deshabilitado.

**La regla se aplica en el servidor**, en `publishPost`, antes de reclamar el artículo y antes de gastar la llamada a la IA. El botón deshabilitado es experiencia de usuario; la frontera real está en la Server Action, como el resto de lo que protege la publicación ([ADR 0012](0012-integridad-de-escritura-de-posts.md)).

### Diccionario en código, no en base de datos

Un módulo puro versionado, revisado por pares y con historial, que es lo que corresponde a una lista sensible. Cambiarlo exige un despliegue. Se descartó una tabla editable porque hoy no existe un rol administrador que pudiera gestionarla ([ADR 0002](0002-un-solo-tipo-de-usuario.md)) y habría que crearlo solo para esto.

### Criterio de inclusión: conservador porque bloquea

Un falso positivo de severidad grave le impide publicar a alguien, así que solo entra lo que es inequívocamente ofensivo en cualquier contexto. Queda deliberadamente fuera toda palabra con uso corriente en español venezolano: "negro" (color y trato afectivo), "coño" (interjección habitual), "arrecho", "vaina", "basura". Los coloquialismos ambiguos como "marico" y "marica", muletillas entre amigos en Venezuela pero ofensivas en otros contextos, quedan en severidad leve: avisan, no bloquean.

Las frases se listan completas ("negro de mierda", "te voy a matar") en lugar de sus palabras sueltas, que aparecen en cualquier texto legítimo.

### Cómo se busca

El escáner (`scan.ts`) es un módulo puro, sin `server-only`, para poder probarlo sin navegador ni red, igual que la lógica de protocolo de la capa de IA. Normaliza el texto (minúsculas, sin acentos, "ñ" como "n") conservando la correspondencia con las posiciones originales, y tolera las evasiones habituales: repetición de letras ("idiiiota"), separadores intercalados ("i-d-i-o-t-a") y sustitución de letras por números ("id10ta"), esta última solo dentro de una palabra para que un número suelto no se convierta en letra.

Se usan lookarounds de Unicode en vez de `\b`, porque `\b` parte las palabras en la primera vocal acentuada o "ñ". Cuando una frase y una de sus palabras coinciden sobre el mismo fragmento ("hijo de puta" y "puta") se informa una sola vez, la más grave y más larga.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Avisar sin bloquear nunca | Fue la opción recomendada; se eligió bloquear para que el contenido grave no dependa solo de que la IA lo detecte después |
| Avisar recién en el diálogo de publicar | Llega tarde: el autor ya terminó de escribir |
| Una sola lista sin categorías | Pierde la distinción entre una grosería y una incitación al odio, que es justo la que pide el marco legal |
| Diccionario en base de datos | Exigiría un rol administrador que el proyecto no tiene |
| Sustituir la moderación con IA por el diccionario | Una lista no entiende el contexto ni detecta lo que no está en ella |

## Consecuencias

- **A favor:** el autor ve el problema mientras escribe, con el término exacto señalado, sin esperar ni consumir cuota. El contenido grave no llega a la llamada de moderación, lo que además ahorra cupo del carril de publicación.
- **En contra:** una lista de términos es evadible y no entiende el contexto. Una cita textual, un artículo periodístico sobre discurso de odio o un texto académico pueden quedar bloqueados de forma legítima pero molesta, y hoy no existe forma de pedir una excepción. Es el costo aceptado de la opción elegida.
- **Falsos negativos:** el diccionario no cubre variantes que no estén listadas, ni el odio expresado sin palabras marcadas. La IA sigue siendo la que lee el contenido completo.
- **El diccionario es legible desde el navegador:** el aviso en vivo mientras se escribe corre en un hook de cliente (`useModerationScan`), así que el módulo `scan.ts` y la lista completa de términos viajan en el bundle del cliente y son legibles con las herramientas de desarrollo. No es un descuido: es la contrapartida obligada de que el aviso sea inmediato y no gaste cuota, y por eso la barrera real de publicación no es este diccionario sino el filtro de IA del servidor. Publicar el diccionario en un módulo separado no cambiaría esto, porque igual tendría que enviarse al cliente para escanear mientras se escribe.
- **Cuándo revisar:** si aparecen falsos positivos que bloqueen artículos legítimos con frecuencia (conviene entonces degradar la categoría a leve antes que quitar el término), si se decide cubrir notas y portadas, o si hace falta una vía para justificar una excepción.
