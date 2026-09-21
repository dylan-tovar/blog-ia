# PRD-5.4 — Rutas de IA: seguridad de la petición, caché y rutas deprecadas

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-5 — IA para el autor](PRD-5-ai-author.md) |
| Dificultad / Esfuerzo | A (avanzada) / M (2 a 3 días) |
| Dueño sugerido / Mentor | D2 / D1 |
| Depende de | [PRD-5.1](PRD-5.1-ai-foundation.md) (errores), [PRD-5.2](PRD-5.2-rate-limit.md) (límite), [PRD-1.2](PRD-1.2-auth-security.md) (sesión) |
| Alimenta a | [PRD-8.1](PRD-8.1-chat-server.md) (el chat usa `runAiStreamRoute`), [PRD-6.1](PRD-6.1-summary-backend.md) (usa el flujo de caché) |
| Código | `src/features/ai/route-runner.server.ts`, `route-helpers.ts`, `cache.ts`, `cache.server.ts`, `cached-feature.ts`, `handlers.server.ts`, `posts.server.ts`, `src/app/api/ai/*/route.ts`, `src/features/ai/components/ai-client.ts` |
| ADRs | [0011](../adr/0011-ia-con-gemini.md), [0019](../adr/0019-rutas-legacy-de-ia-deprecadas.md) |

## Resumen

Todo lo que rodea a la llamada a Gemini y protege al servidor: cómo se **valida una petición** antes de tocar nada (Origin, tipo, tamaño, sesión, Zod), cómo se **cachea** un resultado en la fila del post y qué pasa con las **cuatro rutas antiguas** (`/api/ai/outline|titles|tone|score`) que ninguna pantalla usa. Es el paquete de seguridad de las rutas de IA.

## Qué necesitás entender antes

- [ ] Qué es un **Route Handler** de Next (`route.ts` con `POST`) y en qué se diferencia de una Server Action.
- [ ] Qué es **CSRF** (una web ajena que hace peticiones con tu sesión) y qué es la cabecera `Origin`.
- [ ] Qué es un **status HTTP** (200, 400, 401, 403, 413, 415).
- [ ] Qué es un **compare-and-set** ([PRD-5.3](PRD-5.3-publish-moderation.md)) y una **caché** que se invalida sola.
- [ ] Qué es *código deprecado* frente a *código borrado*.
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `runAiRoute` y `runAiStreamRoute`: el flujo común de las rutas | El contenido del stream del chat: [PRD-8.1](PRD-8.1-chat-server.md) |
| Las comprobaciones de `route-helpers.ts` (Origin, JSON, tamaño) | Los contadores del límite: [PRD-5.2](PRD-5.2-rate-limit.md) |
| La caché en `posts` (`saveAiCache`, `runCachedFeature`) y su trigger | El resumen como funcionalidad: [PRD-6.1](PRD-6.1-summary-backend.md) |
| Las cuatro rutas y handlers deprecados | La ruta `/api/ai/chat` (solo se cita como consumidora) |

## Cómo funciona

Orden de lectura sugerido: `route-helpers.ts` → `route-runner.server.ts` → `src/app/api/ai/outline/route.ts` → `cached-feature.ts` → `cache.server.ts` → `handlers.server.ts`.

### 1. El *preflight* de una petición (`route-runner.server.ts`)

El orden importa: primero lo barato, después lo caro.

| Paso | Comprobación | Si falla |
| :--- | :--- | :--- |
| 1 | `Origin` igual a `x-forwarded-host` (o `host`) | HTTP 403 `forbidden` |
| 2 | `Content-Type: application/json` | HTTP 415 |
| 3 | `Content-Length` declarado ≤ 200 000 bytes (`MAX_AI_BODY_BYTES`) | HTTP 413 |
| 4 | Sesión válida (`supabase.auth.getUser()`) | HTTP 401 `unauthenticated` |
| 5 | Lectura del cuerpo **por trozos** con un presupuesto de bytes (`readBodyWithLimit`) | HTTP 413 en cuanto se cruza el límite |
| 6 | `JSON.parse` y `schema.safeParse` (Zod) | HTTP 400 `bad_request` |

Por qué cada uno:

- **Origin.** Los Route Handlers no traen la protección CSRF que sí tienen las Server Actions, así que hay que verificar `Origin` a mano. Junto con exigir JSON (un formulario ajeno no puede enviar `application/json`), evita que otra web use tu sesión.
- **Lectura por trozos.** Un cuerpo sin `Content-Length` (chunked) podría ser enorme; se corta apenas cruza el límite en vez de guardarlo entero antes de medirlo.
- **Cuenta bytes, no caracteres** (`parseJsonText`): el texto con caracteres de varios bytes es lo que realmente viaja.

### 2. Dos formas de responder

| Función | Uso | Respuesta |
| :--- | :--- | :--- |
| `runAiRoute` | JSON (las herramientas deprecadas) | `{ ok: true, data }` o `{ ok: false, error }`. Los **fallos esperados** (límite, timeout, JSON inválido del modelo) devuelven **HTTP 200** con `ok: false`; solo petición mal formada, sin sesión o de otro origen reciben 4xx |
| `runAiStreamRoute` | El chat ([PRD-8.1](PRD-8.1-chat-server.md)) | Mismo *preflight*, pero la respuesta es un stream NDJSON. El límite de peticiones se evalúa **antes** de abrir el stream |

Devolver 200 con `ok: false` hace que el cliente maneje una sola unión tipada. Todas las respuestas llevan `Cache-Control: no-store` (`respondJson`).

### 3. La caché de resultados

Los resultados de IA cacheables viven en columnas de `posts` (`ai_generated_summary`, `ai_generated_titles`, `content_score`).

- **Invalidación.** Un *trigger* de la base las pone en `NULL` cuando cambia `content` ([PRD-2.1](PRD-2.1-posts-data-rls.md)). Cubre a cualquier escritor sin depender de que cada acción se acuerde.
- **Guardado** (`saveAiCache`, cliente admin): `UPDATE ... WHERE id = ... AND updated_at = <el leído>`. Si el autor editó mientras el modelo trabajaba, `updated_at` cambió y **no se guarda un resultado viejo**. El `updated_at` vuelve **tal cual se leyó** (Postgres guarda microsegundos; pasarlo por un `Date` de JavaScript los truncaría y el compare-and-set nunca coincidiría: comentario en `handlers.server.ts`).
- **Flujo** (`runCachedFeature`): con resultado guardado y sin pedir regenerar, se devuelve **sin limitador y sin modelo**; si no, límite → modelo → guardar. Una escritura de caché fallida **nunca** hace fallar la petición.

### 4. Las cuatro rutas deprecadas

`/api/ai/outline`, `/titles`, `/tone` y `/score` (más `handleOutline`, `handleTitles`, `handleTone`, `handleScore` en `handlers.server.ts`) siguen en el código y funcionan, pero **ninguna pantalla las llama**: ningún módulo de `src/` importa `OutlineDialog`, `ScorePanel`, `TitleSuggestions` ni `ToneCompareDialog`, y el chat cubre lo mismo con mensajes predefinidos ([PRD-8](PRD-8-ai-chat.md)). Solo `use-ai-request.ts` importa `callAiRoute` (para el cupo único de peticiones que usa el chat). Consecuencia: `ai_generated_titles` y `content_score` no se escriben desde ninguna pantalla. Qué hacer con este código es el tema del [ADR 0019](../adr/0019-rutas-legacy-de-ia-deprecadas.md) (estado *Propuesta*).

Además, `loadOwnArticleForAi` (`posts.server.ts`) carga solo un **artículo propio** (`author_id = usuario`, `type = 'article'`): una nota, un post ajeno o un id inexistente reciben la misma respuesta (`not_allowed`) y nunca llegan al modelo.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Route Handlers en vez de Server Actions para las herramientas del editor** (registrado, [ADR 0011](../adr/0011-ia-con-gemini.md): las Server Actions se despachan de a una y una llamada de varios segundos dejaría en cola el autosave) | Server Actions | Hay que verificar `Origin` a mano |
| **Fallos esperados con HTTP 200 y `ok: false`** (comentario en `route-runner.server.ts`) | Usar 429/500 | El cliente maneja una sola unión tipada. Menos útil para herramientas de red que miran el status |
| **Leer el cuerpo por trozos con presupuesto** (comentario en `route-helpers.ts`) | Confiar en `Content-Length` | Un envío sin `Content-Length` no puede saturar la memoria |
| **Caché en la fila del post con trigger e invalidación por contenido** ([ADR 0011](../adr/0011-ia-con-gemini.md)) | Comparar `updated_at` en la aplicación; una tabla de caché aparte † | Si el autor edita durante la generación, el resultado se devuelve pero no se guarda |
| **La escritura de caché nunca rompe la petición** (comentario en `cached-feature.ts`) | Fallar si no se pudo guardar | El usuario siempre recibe su resultado; a costa de regenerar la próxima vez |
| **Código legacy deprecado, no borrado** (estado propuesto en el [ADR 0019](../adr/0019-rutas-legacy-de-ia-deprecadas.md), sin decisión final) | Borrarlo de inmediato | Mientras siga, las cuatro rutas son superficie expuesta (con sesión, origen y límite) sin consumidor, y hay código que mantener †. Borrarlo queda como decisión abierta |

## Criterios de aceptación

- [ ] Una petición con `Origin` distinto responde 403; sin `Content-Type: application/json`, 415.
- [ ] Un cuerpo mayor de 200 000 bytes responde 413, aunque no declare `Content-Length`.
- [ ] Sin sesión responde 401 con `{ ok: false, error: { kind: "unauthenticated" } }`.
- [ ] Un fallo del modelo o del limitador responde HTTP 200 con `ok: false` y un `kind`.
- [ ] Repetir un resultado cacheable sin editar el post no llama al modelo ni consume cupo.
- [ ] Editar el contenido de un artículo pone en `NULL` los tres campos de caché.
- [ ] Una nota, un post ajeno o un id inexistente reciben `not_allowed`.

## Cómo verificarla a mano

1. `pnpm test`: `route-helpers.test.ts`, `cache.test.ts`, `cached-feature.test.ts`.
2. Con la sesión iniciada, desde la consola del navegador en la app: `fetch('/api/ai/outline', {method:'POST', headers:{'content-type':'text/plain'}, body:'x'})` debe responder 415.
3. Sin sesión (ventana privada): la misma petición con `application/json` debe responder 401.
4. `pnpm verify:writes` comprueba además que el cliente no puede escribir las columnas `ai_*`.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Resolver el [ADR 0019](../adr/0019-rutas-legacy-de-ia-deprecadas.md): borrar las cuatro rutas, sus handlers, los cuatro componentes y decidir el destino de `ai_generated_titles` y `content_score` (nueva migración) | A |
| El comentario de `AiErrorMessage.tsx` cita los contenedores legacy (`ScorePanel`, `TitleSuggestions`, `ToneCompareDialog`, `OutlineDialog`) y `AiChatDrawer.tsx` menciona `ScorePanel` en un comentario: actualizarlos | B |
| Extraer de `use-ai-request.ts` el cupo único (`runSlot`) para poder borrar `callAiRoute` sin arrastrarlo | M |
| Agregar tests de `runAiRoute` con `Request` simulados (hoy se prueban las funciones auxiliares, no el flujo completo) | M |
| Confirmar en documentación de despliegue qué cabecera de host envía el proveedor (`x-forwarded-host` vs `host`) | B |

## Preguntas de autoevaluación

1. ¿Por qué se verifica `Origin` en un Route Handler y no hace falta en una Server Action?
2. ¿Por qué el cuerpo se lee por trozos en lugar de fiarse de `Content-Length`?
3. ¿Qué ventaja tiene responder HTTP 200 con `ok: false` para los fallos esperados y qué desventaja?
4. ¿Por qué `updated_at` se pasa "tal cual se leyó" al guardar la caché?
5. ¿Qué pasa con el resultado de IA si el autor edita el artículo mientras se genera?
6. Las cuatro rutas antiguas funcionan pero nadie las llama: ¿qué argumentos hay para borrarlas y cuáles para conservarlas?
