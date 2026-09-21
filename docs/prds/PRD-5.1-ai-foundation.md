# PRD-5.1 — Base de IA: cliente de Gemini, errores y configuración

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-5 — IA para el autor](PRD-5-ai-author.md) |
| Dificultad / Esfuerzo | A (avanzada) / L (más de 3 días) |
| Dueño sugerido / Mentor | D1 / — |
| Depende de | Nada dentro de la IA. Usa el cliente admin de [PRD-1.2](PRD-1.2-auth-security.md) solo en otros paquetes, no aquí |
| Alimenta a | [PRD-5.2](PRD-5.2-rate-limit.md), [PRD-5.3](PRD-5.3-publish-moderation.md), [PRD-5.4](PRD-5.4-ai-route-runner.md), [PRD-6.1](PRD-6.1-summary-backend.md), [PRD-8.1](PRD-8.1-chat-server.md) |
| Código | `src/features/ai/gemini.ts`, `errors.ts`, `thinking.ts`, `first-chunk-deadline.ts`, `constants.ts`, `types.ts`, `schemas.ts`, `output.ts`, `words.ts`, `src/lib/env.server.ts` |
| ADRs | [0011](../adr/0011-ia-con-gemini.md), [0017](../adr/0017-politica-de-thinking-y-reintentos-gemini.md) |

## Resumen

Es la única puerta hacia Gemini. Todo el resto de la IA (moderación, resumen, chat) llama a tres funciones de `gemini.ts` (`generateText`, `generateStructured`, `streamText`) y recibe siempre **el mismo tipo de error** (`AiError`) sin importar qué falló. Concentra las decisiones de costo y fiabilidad: sin reintentos, sin *thinking*, plazos por función y salida validada con Zod. Si esta pieza está mal, todas las funciones de IA fallan o gastan cuota de más.

## Qué necesitás entender antes

- [ ] Qué es una **API externa de un modelo de lenguaje** y por qué puede tardar, cortar o rechazar una petición (glosario: [docs/README.md](../README.md#glosario)).
- [ ] Qué es un **timeout** y una `AbortSignal` (cancelar una petición que está en vuelo).
- [ ] Qué es **Zod** (validar que un dato tiene la forma esperada) y por qué un JSON devuelto por un modelo **no se puede creer sin validar**.
- [ ] Qué es un *generador asíncrono* (`async function*`): lo usa el streaming del chat.
- [ ] Qué es una **variable de entorno** y por qué las claves nunca van al navegador (`server-only`).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Cliente de Gemini (`@google/genai`), configuración por función y mapeo de errores | Qué se le pregunta al modelo (los prompts): cada función tiene el suyo ([PRD-5.3](PRD-5.3-publish-moderation.md), [PRD-6.1](PRD-6.1-summary-backend.md), [PRD-8.1](PRD-8.1-chat-server.md)) |
| Plazos, *thinking* mínimo, reintentos apagados y plazo de primer dato | Límite de peticiones por minuto: [PRD-5.2](PRD-5.2-rate-limit.md) |
| Variables de entorno de IA y sus valores por defecto | Rutas HTTP, Origin y tamaño de cuerpo: [PRD-5.4](PRD-5.4-ai-route-runner.md) |
| Schemas Zod de las respuestas del modelo | Componentes de interfaz |

## Cómo funciona

Orden de lectura sugerido: `types.ts` → `errors.ts` → `constants.ts` → `env.server.ts` → `gemini.ts` → `thinking.ts` → `first-chunk-deadline.ts` → `schemas.ts`.

### 1. Los tipos que usa todo el mundo (`types.ts`)

`GenerateStructured`, `GenerateText` y `StreamText` son **tipos de función**. Los orquestadores (por ejemplo `moderateArticle`) reciben la función por parámetro en vez de importarla: así se prueban sin red (inyección de dependencias). `AiFeature` lista las características: `outline`, `titles`, `tone`, `score`, `moderation`, `summary` y `chat`. Las cuatro primeras son las herramientas deprecadas ([PRD-5.4](PRD-5.4-ai-route-runner.md)).

### 2. Un solo tipo de error (`errors.ts`)

Cualquier fallo, sea un 429 de Google, un *timeout* o un JSON roto, termina en un `AiError` con un `kind`:

| `kind` | Cuándo pasa |
| :--- | :--- |
| `rate_limited` | Nuestro límite por minuto ([PRD-5.2](PRD-5.2-rate-limit.md)); lleva `retryAfter` y `scope` (`user` o `global`) |
| `quota` | HTTP 429 de Gemini (cuota del proveedor) |
| `timeout` | HTTP 408, `AbortError`/`TimeoutError` o mensaje con *timeout* / *timed out* / *aborted* |
| `unavailable` | Cualquier otro fallo del proveedor o de red |
| `invalid_response` | Respuesta vacía, cortada por `MAX_TOKENS` o JSON que no cumple el schema |
| `blocked` | Los filtros de seguridad de Gemini rechazaron el contenido |
| `not_configured` | Sin clave, o HTTP 401/403/404 (el 404 suele ser un `GEMINI_MODEL` inexistente) |
| `input_too_long`, `input_too_short`, `not_allowed`, `unauthenticated` | Validaciones de las funciones, no del proveedor |

`mapGeminiError` decide el `kind` mirando solo el `status` del error (sin importar el SDK) y, si no hay `status`, el nombre o el texto del error. `describeUpstreamError` extrae datos **seguros para loguear** (estado, nombre, código de causa) y nunca el mensaje, porque el mensaje puede repetir el texto del usuario.

### 3. La llamada a Gemini (`gemini.ts`)

```text
callModel(input, jsonSchema?):
  getClient()  -> sin clave: AiError("not_configured")
  generateContent con:
    systemInstruction, temperature y maxOutputTokens según la función (FEATURE_CONFIG)
    abortSignal = timeout de la función (y la señal del llamador, si hay)
    retryOptions.attempts = 1          <- el SDK NO reintenta
    thinkingConfig = thinkingConfigFor(modelo)
    si hay schema: responseMimeType = application/json + responseJsonSchema
  si la respuesta fue bloqueada (promptFeedback o finishReason de seguridad) -> "blocked"
  si terminó por MAX_TOKENS -> "invalid_response"   (medio JSON no sirve)
  si no hay texto -> "invalid_response"
```

`generateStructured` agrega un paso: convierte el schema Zod a JSON Schema para pedírselo al modelo y luego **vuelve a validar** el resultado con el mismo schema. Un JSON que no cumple es `invalid_response` y nunca llega a pantalla.

`streamText` (usado por el chat) es un generador que reenvía trozos. Dos diferencias con `generateText`: un corte por `MAX_TOKENS` **no** es error (una respuesta de chat cortada aún sirve) y está envuelto en el plazo de primer dato (punto 5).

Cada llamada deja un log `[ai]` con función, duración y resultado (`logged`), **sin prompt, respuesta ni clave**.

### 4. Configuración por función

| Función | Temperatura | Máx. tokens de salida | Plazo (`constants.ts`) |
| :--- | :--- | :--- | :--- |
| `moderation` | 0 | 512 | 8 s (`MODERATION_TIMEOUT_MS`) |
| `summary` | 0,3 | 512 | 15 s (`DEFAULT_TIMEOUT_MS`) |
| `chat` | 0,7 | 8192 | 45 s total (`CHAT_TIMEOUT_MS`) y 15 s al primer dato |
| `outline`, `titles`, `score` (deprecadas) | 0,8 / 0,9 / 0,2 | 2048 / 512 / 2048 | 15 s |
| `tone` (deprecada) | 0,6 | 8192 | 25 s (`TONE_TIMEOUT_MS`) |

La moderación usa temperatura 0 para que la misma entrada dé la misma decisión; la lógica es una inferencia, no consta como decisión †.

### 5. *Thinking* y plazo de primer dato

- `thinkingConfigFor(modelo)`: `gemini-2.5-flash*` recibe `thinkingBudget: 0`; `gemini-3*` recibe `thinkingLevel: MINIMAL` porque la serie 3 **rechaza** un presupuesto con HTTP 400; cualquier otro modelo no recibe nada. El comentario del código dice que los tokens de *thinking* comen latencia y cuota gratuita y estas tareas no los necesitan ([ADR 0017](../adr/0017-politica-de-thinking-y-reintentos-gemini.md)).
- `withFirstChunkDeadline(stream, ms, onTimeout)`: compite el primer trozo contra un reloj. Si el reloj gana, **cancela la petición a Gemini** (`onTimeout`) y falla con `timeout`. Los trozos siguientes no tienen límite propio.

### 6. Variables de entorno (`src/lib/env.server.ts`)

| Variable | Por defecto | Rango |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | (obligatoria para usar IA) | texto no vacío |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | texto no vacío |
| `AI_RATE_LIMIT_USER_PER_MIN` | 5 | 1 a 600 |
| `AI_RATE_LIMIT_GLOBAL_PER_MIN` | 6 | 1 a 6000 |
| `AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN` | 4 | 1 a 6000 |

`getAiEnv()` se evalúa **de forma perezosa** (solo cuando alguien usa IA): sin `GEMINI_API_KEY` la app arranca y solo se degrada la IA. Un valor en blanco (`GEMINI_MODEL=`) cae al valor por defecto.

### 7. Schemas y utilidades

- `schemas.ts`: forma esperada de cada respuesta (`moderationSchema`, `articleAnalysisSchema`, etc.) y de las peticiones del chat. Los schemas de respuesta son **a propósito algo más flexibles** que el prompt (por ejemplo acepta de 3 a 8 títulos aunque se pidan 5): una respuesta casi correcta no debería ser un fallo.
- `output.ts`: `cleanSummary` (quita Markdown, máximo 1200 caracteres) y `cleanToneOutput` (deprecada).
- `words.ts`: `countWords` y `assertMinWords` (lanza `input_too_short`).

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Gemini Flash gratuito, solo en el servidor** ([ADR 0011](../adr/0011-ia-con-gemini.md)) | El PRD global original decía "OpenAI/Anthropic" sin elegir | La cuota gratuita es un recurso compartido y limitado: de ahí el limitador ([PRD-5.2](PRD-5.2-rate-limit.md)) |
| **Sin reintentos del SDK** (comentario en `gemini.ts`, [ADR 0017](../adr/0017-politica-de-thinking-y-reintentos-gemini.md)) | Dejar el reintento por defecto | Cada reintento gasta cuota; el usuario decide si reintentar con el botón |
| ***Thinking* mínimo** (comentario en `thinking.ts`) | Pensamiento por defecto del modelo | Menos latencia y menos cuota; menos "razonamiento" del modelo |
| **Un solo tipo de error** | Distintas excepciones por función | Toda interfaz muestra los mismos mensajes; es más fácil probar |
| **Funciones inyectadas en vez de importadas** (`GenerateStructured`) | Importar `gemini.ts` en cada orquestador | Pruebas sin red. El costo es un parámetro más |
| **Validar dos veces (schema para el modelo y `safeParse` después)** | Confiar en el JSON del modelo | Un modelo puede devolver un formato inesperado; validar evita romper la interfaz |
| **Clave leída de forma perezosa** (comentario en `env.server.ts`) | Validar todo al arrancar | La app funciona sin clave de IA |
| **Modelo por defecto `gemini-3.5-flash-lite`** | — | Por qué se eligió ese modelo **no quedó registrado** † |

## Criterios de aceptación

- [ ] Sin `GEMINI_API_KEY` la app arranca y cualquier función de IA responde `not_configured`.
- [ ] Un 429 de Gemini se ve como `quota`; un 401/403/404 como `not_configured`; un 408 o `AbortError` como `timeout`; cualquier otro fallo como `unavailable`.
- [ ] Una respuesta bloqueada por seguridad es `blocked`, no `unavailable`.
- [ ] Una respuesta de JSON cortada por `MAX_TOKENS` o que no cumple el schema es `invalid_response`.
- [ ] En el chat, un corte por `MAX_TOKENS` conserva el texto recibido.
- [ ] Si Gemini no responde en 15 s al primer dato, la petición se cancela aguas arriba y el error es `timeout`.
- [ ] Los logs `[ai]` no contienen prompt, respuesta ni clave.

## Cómo verificarla a mano

1. `pnpm test` y mirá que pasen `errors.test.ts`, `thinking.test.ts`, `first-chunk-deadline.test.ts` y `schemas.test.ts`.
2. Sin clave: quitá `GEMINI_API_KEY` de `.env.local`, reiniciá `pnpm dev`, abrí el editor y pedile algo al chat: debe aparecer el mensaje de "La IA no está configurada".
3. Con clave real: `pnpm ai:smoke` prueba el modelo, la salida JSON y una llamada con herramientas contra Gemini. Ojo: usa **su propia** lista de herramientas y prompt, distintos de los de producción.
4. Modelo inexistente: poné `GEMINI_MODEL=modelo-que-no-existe` y repetí el chat: esperá `not_configured` (el 404 se mapea así).

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Decidir si `outline`, `titles`, `tone` y `score` salen de `AiFeature` y de `FEATURE_CONFIG` cuando se resuelva el [ADR 0019](../adr/0019-rutas-legacy-de-ia-deprecadas.md) | M |
| Escribir un test que fije la tabla `thinkingConfigFor` para modelos futuros (hoy cualquier modelo que no sea 2.5-flash o 3.x no recibe configuración) | B |
| `BLOCKED_FINISH_REASONS` es una lista fija (`SAFETY`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`): revisar contra la documentación vigente de Gemini si faltan motivos | M |
| `gemini.ts` no tiene test propio (depende del SDK). Extraer `throwIfBlocked` y la construcción de `requestConfig` a funciones puras para poder probarlas sin red | M |

## Preguntas de autoevaluación

1. ¿Por qué `generateStructured` valida el JSON dos veces (schema para el modelo y `safeParse` después)?
2. ¿Qué diferencia hay entre `blocked` e `invalid_response` y por qué `MAX_TOKENS` es error en JSON pero no en el chat?
3. ¿Por qué el SDK tiene `retryOptions.attempts = 1` y quién decide entonces reintentar?
4. ¿Qué pasa exactamente cuando vence el plazo de primer dato? ¿Se cancela la llamada a Gemini o solo se ignora?
5. ¿Por qué `getAiEnv()` es perezoso y qué pasaría si se validara al arrancar?
6. ¿Por qué se pasa `generate` como parámetro a `moderateArticle` en vez de importarlo?
