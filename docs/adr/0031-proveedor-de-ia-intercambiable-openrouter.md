# 0031. Proveedor de IA intercambiable: Gemini u OpenRouter, elegido por variable de entorno

- **Estado:** Aceptada. Extiende el [ADR 0011](0011-ia-con-gemini.md) (Gemini como proveedor) sin reemplazarlo: Gemini sigue siendo el proveedor por defecto. La política de thinking, reintentos y timeouts del [ADR 0017](0017-politica-de-thinking-y-reintentos-gemini.md) se mantiene y se aplica al nuevo adaptador en lo que le corresponde.
- **Fecha:** 2026-09-22
- **Fuentes:** [PRD-5](../prds/PRD-5-ai-author.md), [PRD-6](../prds/PRD-6-ai-reader.md), [PRD-8](../prds/PRD-8-ai-chat.md); `src/features/ai/types.ts`, `src/features/ai/gemini.ts`, `src/features/ai/openrouter.ts`, `src/features/ai/openrouter-protocol.ts`, `src/features/ai/provider.server.ts`, `src/lib/env.server.ts`

## Contexto

Toda la IA del proyecto se resolvía con un único proveedor, Gemini, sin alternativa. Se pidió incorporar OpenRouter, que da acceso a cientos de modelos de distintos fabricantes detrás de una sola clave y una sola API, compatible con el protocolo de OpenAI.

La capa ya estaba preparada para esto sin habérselo propuesto: `types.ts` define tres funciones (`GenerateText`, `GenerateStructured`, `StreamText`) y toda la orquestación (moderación, resumen, chat del editor, rutas de IA) depende de esas firmas, no del SDK. `gemini.ts` es la única implementación y solo la importan tres archivos. Es decir, el puerto ya existía y faltaba el segundo adaptador.

Dos piezas más estaban ya desacopladas del SDK y se pudieron reusar tal cual: `modelPartsToStreamParts` (`function-calls.ts`), que valida con Zod lo que el modelo propone y descarta lo inválido, y `mapGeminiError` (`errors.ts`), que clasifica errores por el `status` HTTP y no por el tipo de error del SDK.

## Decisión

### Un adaptador por proveedor detrás del puerto que ya existía

`openrouter.ts` implementa las mismas tres funciones que `gemini.ts`. `provider.server.ts` es el único lugar que elige entre los dos y es lo que importan los tres consumidores (`handlers.server.ts`, `summary-actions.ts` y `posts/actions.ts`). El resto de la capa no sabe cuál está activo.

Lo que antes era privado de `gemini.ts` y ahora comparten ambos:

| Módulo nuevo | Qué contiene | Por qué se extrajo |
| :--- | :--- | :--- |
| `feature-config.ts` | Temperatura y tope de tokens por función | Es política del producto (la moderación no improvisa, los títulos sí), no detalle de un proveedor |
| `provider-telemetry.ts` | `logged` y `loggedStream` | Los dos adaptadores deben registrar lo mismo, solo metadatos, y convertir todo fallo en `AiError` |

### Un proveedor a la vez, por `AI_PROVIDER`

`AI_PROVIDER=gemini` (por defecto) u `openrouter`. Se descartó elegir proveedor por función y se descartó el respaldo automático: ver alternativas.

El esquema de entorno solo exige la configuración del proveedor activo: con `AI_PROVIDER=openrouter` no hace falta clave de Gemini, y al revés. Falta de clave o de modelo sale como `not_configured`, el mismo error que ya devolvía Gemini sin configurar, así que la app sigue funcionando sin IA.

`OPENROUTER_MODEL` **no tiene valor por defecto**, a diferencia de `GEMINI_MODEL`: el catálogo de OpenRouter cambia seguido y un id inventado fallaría con un 404 difícil de interpretar. El modelo elegido debe admitir `tools` y `response_format`; `pnpm ai:smoke:openrouter` lo comprueba contra el catálogo antes de gastar una llamada.

### Sin dependencia nueva: `fetch` y el protocolo de OpenAI

OpenRouter habla el protocolo de OpenAI, así que el adaptador usa `fetch` directamente contra `https://openrouter.ai/api/v1/chat/completions`. Se descartó el SDK `openai` por dos razones: es una dependencia para un contrato que cabe en un módulo, y reintenta por defecto, justo lo que el ADR 0017 prohíbe (cada reintento gasta saldo). Con `fetch` no hay reintentos que desactivar y el control de `AbortSignal` y timeout es directo.

La traducción del protocolo vive en `openrouter-protocol.ts`, **sin** `server-only` y sin I/O, para poder probarla sin red, igual que `function-calls.ts` con el formato de Gemini. Cubre lo que cambia entre protocolos:

| Asunto | Gemini | OpenRouter |
| :--- | :--- | :--- |
| Instrucción de sistema | Campo `systemInstruction` | Un mensaje más, con rol `system` |
| Rol del asistente | `model` | `assistant` |
| Salida estructurada | `responseJsonSchema` | `response_format: { type: "json_schema" }` |
| Herramientas | `functionDeclarations` | `tools: [{ type: "function", function: {...} }]` |
| Bloqueo por contenido | `finishReason` SAFETY, BLOCKLIST… | `finish_reason: "content_filter"` |
| Streaming | Chunks del SDK | SSE: líneas `data:`, comentarios `:` como señal de vida y `[DONE]` al final |
| Llamadas a herramienta | Completas en cada chunk | **Troceadas entre chunks**, agrupadas por `index` |

Tres estados HTTP de OpenRouter no significan lo que supone el mapeo genérico de `errors.ts`, que clasifica por `status` pensando en Gemini, así que el adaptador los traduce antes:

| Estado | Significado en OpenRouter | Se traduce a | Por qué importa |
| :--- | :--- | :--- | :--- |
| 403 | Su moderación de entrada marcó el contenido | `blocked` | Con el mapeo genérico caía en `not_configured`, y al publicar eso **publica el artículo sin tags** en lugar de rechazarlo. Es el equivalente al bloqueo de seguridad de Gemini y debe rechazar |
| 402 | Sin saldo en la cuenta | `quota` | El genérico lo daba por `unavailable` ("la IA no está disponible"), cuando el mensaje correcto es que se agotó el cupo. Al publicar el resultado es el mismo: se publica sin tags automáticos |
| 401 | Credenciales inválidas | `not_configured` | Sin cambios respecto del mapeo genérico |

La última fila de la tabla anterior es la diferencia que más pesa. En Gemini cada chunk trae la llamada completa y se valida al vuelo; en OpenRouter el nombre llega en el primer delta y los argumentos van llegando en fragmentos de JSON, así que las propuestas solo se pueden validar y emitir **cuando el stream termina**. La consecuencia visible es el orden: con OpenRouter el texto de la respuesta aparece primero y las tarjetas de propuesta después, todas juntas. Una vez armadas, pasan por el mismo `modelPartsToStreamParts` que las de Gemini, de modo que la validación con Zod y el descarte de lo inválido son idénticos.

Esa misma diferencia obliga a medir de otra forma el plazo del primer fragmento (`CHAT_FIRST_CHUNK_TIMEOUT_MS`, 15 s). `withFirstChunkDeadline` mide hasta la primera **parte emitida**, y en OpenRouter una respuesta hecha solo de llamadas a herramienta (por ejemplo un análisis del artículo) no emite ninguna parte hasta que el stream termina: ese plazo se habría convertido en el de la respuesta entera y habría cortado a los 15 s respuestas que iban bien, con 45 s de presupuesto real. El adaptador lo implementa por su cuenta, sobre la llegada de la primera carga SSE, que es lo que el plazo quiere vigilar: que el proveedor esté respondiendo.

Dos defensas más sobre datos que controla el proveedor: el `index` de una llamada a herramienta se valida y se acota antes de usarlo como índice de array (un valor enorme dejaría un array disperso cuya copia agota la memoria y mata el proceso con un fallo que el stream no puede capturar), y el nombre de herramienta que informa el modelo nunca se registra tal cual, solo si coincide con uno declarado, porque puede derivar del texto del autor.

### Lo que no cambia

Límite de peticiones por minuto en Postgres con dos carriles, caché de resultados con compare-and-set, moderación con reclamo, prompts con delimitadores, política de "solo artículos" y registro de metadatos sin contenido ni claves. Todo eso vive por encima del puerto y es indiferente al proveedor.

`thinking.ts` sigue siendo de Gemini: el presupuesto de razonamiento es un campo de su API y no tiene equivalente en el protocolo de OpenAI.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Un proveedor por función de IA (chat en uno, moderación en otro) | Multiplica los estados posibles y lo que hay que probar, para un problema que hoy no existe |
| OpenRouter con Gemini de respaldo automático | Choca con el ADR 0017 (no reintentar: gasta cuota) y duplica la latencia del peor caso. Además esconde el fallo en lugar de mostrarlo |
| SDK `openai` apuntado a OpenRouter | Dependencia nueva que reintenta por defecto; el contrato que se necesita cabe en un módulo propio |
| Reescribir la capa con una abstracción tipo "AI gateway" | El puerto de `types.ts` ya alcanzaba; una capa más sería complejidad sin problema que la pague |
| Mantener el nombre `NEXT_OPEN_ROUTER_API_KEY` propuesto al pedir la feature | El prefijo `NEXT_` sugiere que la variable llega al navegador (solo lo hace `NEXT_PUBLIC_`), y ningún otro secreto del proyecto lo lleva. Se usa `OPENROUTER_API_KEY` |

## Consecuencias

- **A favor:** cambiar de proveedor o de modelo es una variable de entorno, sin tocar código. El puerto queda demostrado con dos implementaciones, no con una sola. La lógica de protocolo quedó pura y cubierta por pruebas sin red.
- **En contra:** hay dos adaptadores que mantener, y una diferencia de comportamiento observable (las propuestas del chat llegan al final del stream con OpenRouter). El adaptador de OpenRouter habla el protocolo directo, así que un cambio del proveedor hay que absorberlo a mano, sin SDK que lo amortigüe.
- **Deuda conocida:** `mapGeminiError` conserva ese nombre aunque ya sirve a los dos proveedores (clasifica por `status` HTTP, no por SDK). Renombrarlo tocaría ocho archivos y se dejó fuera para no chocar con trabajo en curso.
- **Verificación:** `pnpm ai:smoke:openrouter` comprueba contra la API real que el modelo existe, que admite lo que la app necesita, que la salida JSON estructurada funciona y que el streaming con function calling devuelve una propuesta utilizable.
- **Cuándo revisar:** si se necesita más de un proveedor a la vez, si OpenRouter cambia el formato de los deltas de `tool_calls`, o si aparece un modelo que exija `strict: true` en `response_format` (hoy se omite a propósito: la respuesta se vuelve a validar con Zod, que es la garantía real).
