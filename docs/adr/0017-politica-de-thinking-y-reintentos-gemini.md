# 0017. Política de thinking, reintentos y timeouts de Gemini

- **Estado:** Aceptada
- **Fecha:** 2026-09-20 (escrito después de implementar; los motivos salen de los comentarios de `thinking.ts` y `gemini.ts`)
- **Fuentes:** `src/features/ai/thinking.ts`, `src/features/ai/gemini.ts`, `src/features/ai/constants.ts`, `src/features/ai/first-chunk-deadline.ts`, `src/features/ai/errors.ts`, [ADR 0011](0011-ia-con-gemini.md)

## Contexto

Todas las funciones de IA corren sobre la capa gratuita de Gemini Flash, con cuota por proyecto que no se publica ([ADR 0011](0011-ia-con-gemini.md)). Tres comportamientos por defecto del SDK y del modelo gastan cuota o latencia sin aportar a estas tareas (moderar, sugerir tags, resumir, estructurar, proponer ediciones): los tokens de "thinking", los reintentos automáticos y las llamadas que se quedan colgadas.

## Decisión

- **Thinking mínimo según la familia del modelo** (`thinkingConfigFor`): `gemini-2.5-flash*` recibe `thinkingBudget: 0`; `gemini-3*` recibe `thinkingLevel: MINIMAL`, porque la familia 3.x **rechaza** un presupuesto con HTTP 400 y admite un nivel; cualquier otro modelo no recibe configuración. El motivo declarado: los tokens de razonamiento cuestan latencia y cuota y estas tareas no los necesitan.
- **Sin reintentos del SDK.** Cada llamada se hace con `retryOptions: { attempts: 1 }`. El SDK reintenta 429 y 5xx por defecto y cada reintento consume cuota. El reintento lo decide el usuario (botón "Reintentar") o, en la moderación, el autor al volver a publicar.
- **Timeout por función**, con `AbortSignal.timeout` combinado con la señal de la petición: moderación 8 s, valor por defecto 15 s (outline, títulos, score, resumen), tono 25 s, chat 45 s. En el chat, además, un **plazo para el primer fragmento** (15 s, `withFirstChunkDeadline`) que aborta la llamada aguas arriba si Gemini no empieza a responder; los fragmentos siguientes no tienen límite propio.
- **Temperatura y salida máxima por función** (`FEATURE_CONFIG`): moderación 0 (determinista), score 0,2, resumen 0,3, tono 0,6, chat 0,7, outline 0,8, títulos 0,9; salidas de 512 a 8192 tokens según la función.
- **Cortes por longitud.** Un `MAX_TOKENS` es un error (`invalid_response`) para JSON y para el tono (medio JSON o medio artículo reescrito es inútil), pero se tolera en el chat (una respuesta acortada sigue sirviendo).
- **Errores mapeados a `kind` tipados** (`mapGeminiError`): 429 es `quota`; 401, 403 y 404 son `not_configured` (un 404 significa que el modelo configurado no existe para esa clave); 408 y los abortos son `timeout`; cualquier otro estado es `unavailable`. Los bloqueos de seguridad (`promptFeedback.blockReason`, `finishReason` de seguridad) son `blocked`.
- **Registro sin contenido.** Los logs `[ai]` llevan solo función, duración, resultado, `kind` y detalle técnico (`describeUpstreamError`: estado HTTP, nombre del error, código de causa); nunca el prompt, la respuesta ni la clave.
- **Modelo configurable.** `GEMINI_MODEL` (por defecto `gemini-3.5-flash-lite`) se puede cambiar sin tocar código; `pnpm ai:smoke` comprueba que responde y devuelve JSON válido.

Observación: el Route Handler del chat declara `maxDuration = 30`, mientras que `CHAT_TIMEOUT_MS` es 45 s. En una plataforma que respete `maxDuration`, el límite de la plataforma corta antes que el timeout de la aplicación; en un servidor propio, no.

## Alternativas consideradas

Las marcadas con † son razonamiento reconstruido a partir del código, no una discusión registrada.

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Dejar el thinking por defecto del modelo | Más latencia y más consumo de cuota sin beneficio en tareas simples (motivo del comentario en `thinking.ts`) |
| Un solo `thinkingBudget` para todos los modelos | La familia 3.x lo rechaza con 400 |
| Reintentos automáticos del SDK | Cada reintento gasta cuota de la capa gratuita |
| Reintentar nosotros con espera exponencial † | Agrega latencia y cuota gastada sin que el usuario lo decida; el usuario puede reintentar |
| Un timeout único para todo † | La moderación necesita responder rápido porque bloquea la publicación; reescribir un artículo necesita más margen |

## Consecuencias

- **A favor:** respuestas más rápidas y un consumo de cuota predecible; los fallos llegan al usuario como mensajes claros en español.
- **En contra:** el patrón `^gemini-3` cubre toda la familia 3.x; un modelo 3.x que no admita `MINIMAL` fallaría con 400 (no verificado). Un fallo transitorio se muestra al usuario en vez de reintentarse en silencio. Los valores de temperatura y tokens son constantes en el código, sin evaluación registrada.
- **Cuándo revisar:** al cambiar de modelo o de plan (los límites y la semántica del thinking cambian), si aparecen fallos transitorios frecuentes que justifiquen un reintento controlado, o si se alinean `maxDuration` y `CHAT_TIMEOUT_MS`.
