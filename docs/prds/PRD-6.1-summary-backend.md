# PRD-6.1 — Resumen de artículos: acción del servidor

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-6 — IA para el lector](PRD-6-ai-reader.md) |
| Dificultad / Esfuerzo | M (media) / S (hasta 1 día) |
| Dueño sugerido / Mentor | D3 / D1 |
| Depende de | [PRD-5.1](PRD-5.1-ai-foundation.md) (Gemini), [PRD-5.2](PRD-5.2-rate-limit.md) (límite), [PRD-5.4](PRD-5.4-ai-route-runner.md) (caché) |
| Alimenta a | [PRD-6.2](PRD-6.2-summary-ui.md) (el botón que la llama) |
| Código | `src/features/ai/summary-actions.ts` (`getPostSummary`), `buildSummaryPrompt` en `prompts.ts`, `cleanSummary` en `output.ts`, `assertMinWords` en `words.ts` |
| ADRs | [0011](../adr/0011-ia-con-gemini.md), [0012](../adr/0012-integridad-de-escritura-de-posts.md) |

## Resumen

Una sola Server Action, `getPostSummary(postId)`, que devuelve el resumen de un artículo publicado. Si ya existe uno guardado lo entrega sin costo (a cualquiera, con o sin sesión). Si no, exige sesión, aplica el límite por minuto, le pide a Gemini 2 o 3 oraciones en texto plano y lo guarda en el post para todos los demás. Es un buen paquete para aprender el patrón "cachear un resultado caro de IA".

## Qué necesitás entender antes

- [ ] Qué es una **Server Action** (`"use server"`) y por qué el servidor no debe confiar en lo que manda el navegador (por eso repite las validaciones del botón).
- [ ] Qué es una **caché**: guardar un resultado para no volver a pagarlo.
- [ ] Qué es RLS y que aquí la lectura del post usa el cliente del usuario (solo ve posts publicados o propios).
- [ ] Idea de un **compare-and-set** ([PRD-5.4](PRD-5.4-ai-route-runner.md)).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `getPostSummary` completa, sus validaciones y su resultado tipado | El botón, la tarjeta y los mensajes: [PRD-6.2](PRD-6.2-summary-ui.md) |
| El prompt del resumen y la limpieza del texto (`cleanSummary`) | El cliente de Gemini: [PRD-5.1](PRD-5.1-ai-foundation.md) |
| El umbral de 300 palabras al **generar** | Calcular `wordCount` al cargar la página ([PRD-2.6](PRD-2.6-post-detail.md)) |

## Cómo funciona

Orden de lectura sugerido: `summary-actions.ts` → `buildSummaryPrompt` → `output.ts` (`cleanSummary`) → `words.ts`.

```text
getPostSummary(postId):
  validar el id                                   -> si es inválido: not_allowed
  cargar el post (cliente del usuario, RLS): status = published Y type = article
                                                  -> si no existe: not_allowed
  si ai_generated_summary tiene texto -> devolverlo { cached: true }   // sin sesión, sin costo
  exigir sesión                                   -> si no hay: unauthenticated
  exigir 300 palabras (assertMinWords)            -> si no llega: input_too_short
  runCachedFeature:
    límite por minuto (carril "assist")           -> rate_limited con retryAfter
    generateText(feature "summary", 15 s)         -> Gemini
    cleanSummary(texto)                           -> texto plano, máximo 1200 caracteres
    saveAiCache(post.id, updated_at leído, { ai_generated_summary })   // compare-and-set, cliente admin
  devolver { ok: true, summary, cached: false }
```

Resultado tipado (`SummaryResult`): `{ ok: true, summary, cached }` o `{ ok: false, error: { kind, message, retryAfter? } }`. `failure(error)` traduce cualquier excepción (`AiError` o desconocida) a ese formato; los errores desconocidos se loguean solo por nombre.

Puntos finos:

- **Leer un resumen guardado es gratis y público; generarlo cuesta.** Por eso el orden: primero devolver lo guardado, y solo si no hay, pedir sesión y límite.
- **Solo artículos publicados.** Un borrador o una nota nunca llega al modelo; la consulta ya los filtra.
- **`cleanSummary`.** El resumen se muestra como **texto plano**, así que se convierte cualquier Markdown que agregue el modelo (`markdownToPlainText`), se colapsan espacios y se recorta a 1200 caracteres. Si queda vacío es `invalid_response`.
- **Guardado con el cliente admin.** Las columnas `ai_*` no son escribibles por el navegador ([ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md)); la condición sobre `updated_at` asegura que solo se guarda para la versión del contenido que se resumió. Si el autor editó mientras tanto, el lector recibe su resumen igual pero **no se guarda**.
- **Recorte de entrada.** El prompt envía como máximo 30 000 caracteres (`AI_MAX_INPUT_CHARS`) y lo avisa: el resumen de un artículo muy largo refleja solo esa parte.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Bajo demanda, no al publicar** (PRD original) | Resumir todos los posts al publicar | Se ahorran llamadas en posts que nadie resume; el primer lector espera unos segundos |
| **Generar exige sesión; leer uno guardado no** (comentario en `summary-actions.ts`) | Permitir generar a anónimos | Un visitante sin sesión no puede provocar gasto de cuota |
| **Invalidación por trigger y compare-and-set** ([ADR 0011](../adr/0011-ia-con-gemini.md)) | Una columna `summary_generated_at` comparada con `updated_at` (el diseño original) | Cubre a cualquier escritor; un cambio de título no invalida el resumen |
| **Texto plano de 2 o 3 oraciones** (comentario en `output.ts`) | Markdown | No se renderiza contenido que no se controla †. Un resumen corto no necesita formato |
| **Umbral de 300 palabras repetido en el servidor** (comentario en `summary-actions.ts`) | Confiar en el botón | Llamar la acción a mano con un artículo corto no genera nada |

## Criterios de aceptación

- [ ] Pedir el resumen de un artículo no editado dos veces hace una sola llamada a Gemini.
- [ ] Un visitante sin sesión recibe el resumen guardado; si no existe, recibe `unauthenticated`.
- [ ] Un artículo de menos de 300 palabras, una nota o un borrador no generan resumen.
- [ ] Al superar el límite por minuto, el error trae `retryAfter`.
- [ ] Editar el contenido del artículo borra el resumen guardado.
- [ ] El resumen nunca contiene Markdown y no supera 1200 caracteres.

## Cómo verificarla a mano

1. `pnpm test`: `output.test.ts` (limpieza), `words.test.ts`, `prompts.test.ts` y `cached-feature.test.ts`.
2. Con clave de Gemini: iniciá sesión, abrí un artículo publicado de 300 palabras o más, pulsá "Ver resumen" y comprobá que aparece.
3. Cerrá sesión (o usá una ventana privada) y abrí el mismo artículo: el resumen se ve sin generar nada.
4. Editá el artículo (agregá una palabra) y volvé a abrirlo: el resumen se regenera, no se reutiliza el viejo.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| No existe una prueba de la acción completa: escribir un test de `getPostSummary` con el cliente de Supabase y `generateText` simulados (resumen guardado, sin sesión, texto corto, límite) | M |
| `getPostSummary` no recibe la señal de la petición: cerrar la pestaña no cancela la llamada a Gemini | M |
| No hay forma de **regenerar** un resumen sin editar el contenido: valorar un botón "Regenerar" (afecta al límite y a la caché) | M |
| Dos lectores que piden a la vez un resumen aún inexistente lanzan dos llamadas; solo la primera escritura gana el compare-and-set y ambas consumen cupo. Diseñar cómo evitarlo | A |
| El umbral de palabras se calcula al **cargar la página**; el servidor lo verifica solo al generar, no al leer un resumen guardado. Documentar o unificar el criterio | B |

## Preguntas de autoevaluación

1. ¿Por qué se devuelve el resumen guardado **antes** de pedir sesión?
2. ¿Por qué el guardado usa el cliente admin y qué impide que un lector guarde un resumen falso?
3. ¿Qué pasa si el autor edita mientras Gemini genera el resumen?
4. ¿Por qué se limpia el Markdown del resumen si Gemini ya dice que devuelva texto plano?
5. ¿Qué diferencia hay entre `input_too_short` y `not_allowed`?
6. Dos lectores piden a la vez un resumen que no existe: ¿qué ocurre y qué costo tiene?
