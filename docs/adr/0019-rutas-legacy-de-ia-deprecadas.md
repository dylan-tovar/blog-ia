# 0019. Herramientas de IA "legacy" (outline, títulos, tono, score): deprecadas, sin borrar todavía

- **Estado:** Propuesta
- **Fecha:** 2026-09-20 (escrito después de implementar el chat; la decisión de borrar o conservar el código sigue abierta)
- **Fuentes:** [ADR 0011](0011-ia-con-gemini.md), [ADR 0013](0013-chat-ia-protocolo-ndjson-y-function-calling.md), [PRD-5](../prds/PRD-5-ai-author.md), [PRD-8](../prds/PRD-8-ai-chat.md), `src/app/api/ai/`, `src/features/ai/`

## Contexto

PRD-5 y ADR 0011 definieron cuatro herramientas del editor como diálogos que llaman a Route Handlers JSON. El chat del editor ([ADR 0013](0013-chat-ia-protocolo-ndjson-y-function-calling.md)) las reemplazó: los botones "Estructura", "Títulos", "Tono" y "Analizar" del cajón envían un prompt ya escrito al chat, y el análisis llega como tarjeta (`present_analysis`). Las herramientas viejas quedaron en el código **sin ningún llamador**.

Comprobado en el código:

- Ningún componente importa `OutlineDialog`, `ScorePanel`, `TitleSuggestions` ni `ToneCompareDialog`; solo aparecen nombrados en comentarios.
- `PostEditor` usa `useAiRequest` únicamente para `runSlot` (el canal de una sola petición en vuelo que usa el chat); la variante `run`, que llama a `callAiRoute`, no tiene llamadores.
- Las cuatro rutas siguen expuestas y funcionan: `POST /api/ai/outline`, `/titles`, `/tone`, `/score`.
- Las columnas `ai_generated_titles` y `content_score` de `posts` solo las escriben y leen esos handlers.

## Decisión

Por ahora se **documentan como deprecadas y no se borran**. Este ADR queda `Propuesta` hasta que alguien decida entre borrarlas o rehabilitarlas.

Si se aprueba el borrado, esto es lo que saldría (nada de lo del chat, la moderación ni el resumen):

| Área | Qué se elimina |
| :--- | :--- |
| Rutas | `src/app/api/ai/outline/`, `titles/`, `tone/`, `score/` |
| Handlers y helpers | `handleOutline`, `handleTitles`, `handleScore`, `handleTone` en `handlers.server.ts`; `loadOwnArticleForAi` (`posts.server.ts`); `parseCachedTitles` y `parseCachedScore` (`cache.ts`); `cleanToneOutput` (`output.ts`) |
| Prompts y esquemas | `buildOutlinePrompt`, `buildTitlesPrompt`, `buildTonePrompt`, `buildScorePrompt`; los esquemas de petición (`outlineRequestSchema`, `postAiRequestSchema`, `toneRequestSchema`) y de salida (`outlineSchema`, `titlesSchema`, `contentScoreSchema`) |
| Constantes | `TONE_TIMEOUT_MS`, `TONE_MAX_INPUT_CHARS`, `MIN_WORDS_TONE`, `MIN_WORDS_TITLES`, `MIN_WORDS_SCORE` y los límites de outline y títulos que ya no usa nadie (revisar `ai-ui.ts` antes) |
| Cliente | `OutlineDialog`, `ScorePanel`, `TitleSuggestions`, `ToneCompareDialog`; la variante `run` de `useAiRequest` y, en `ai-client.ts`, `callAiRoute` con los tipos `AiRoutes` y `AiFeatureName` (`runSlot`, `markSuperseded`, `UNAVAILABLE`, `isAbort`, `isTypedError`, `AiResult` y `Fetcher` los sigue usando el chat) |
| Base de datos | Una migración nueva que elimine `ai_generated_titles` y `content_score` (y su rama del trigger `posts_invalidate_ai_cache`), más el ajuste de `database.types.ts`. `ai_generated_summary` se conserva: la usa el resumen del lector |
| Documentación | Marcar la sección «Herramientas de asistencia originales» de PRD-5 como reemplazada por PRD-8 y actualizar `db/schema.md` |

## Alternativas consideradas

Las marcadas con † son razonamiento reconstruido a partir del código, no una discusión registrada.

| Alternativa | Por qué se descartó / cuándo convendría |
| :--- | :--- |
| Borrar ya † | No se pidió; borrar código y una migración de datos sin decisión explícita es irreversible en producción |
| Rehabilitar los diálogos junto al chat † | Duplicaría las funciones que el chat ya cubre y dos caminos a mantener |
| Conservar las rutas como API estable para otro cliente | No existe un segundo cliente; hoy son superficie de ataque y de mantenimiento sin uso |

## Consecuencias

- **A favor:** no se pierde nada mientras se decide; la doc dice la verdad (el producto es el chat).
- **En contra:** hay cuatro endpoints activos y unos cientos de líneas con tests sin uso real; las columnas de caché siguen ocupando espacio y el trigger las invalida en cada cambio de contenido; PRD-5 describe una interfaz que no existe (aclarado en el propio PRD).
- **Cuándo revisar:** ya. Si se aprueba, hacerlo en una sola pasada: código, una migración `0008` y documentación juntos, para no dejar el esquema y los tipos desalineados ([ADR 0016](0016-migraciones-sql-manuales.md)).
