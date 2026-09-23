# 0033. Claude como proveedor de IA por defecto, con el SDK oficial de Anthropic

- **Estado:** Aceptada. Extiende el [ADR 0031](0031-proveedor-de-ia-intercambiable-openrouter.md) (proveedor intercambiable) y **cambia dos de sus decisiones**: el proveedor por defecto deja de ser Gemini y pasa a ser Claude, y la regla de "sin dependencia nueva" no aplica a este adaptador.
- **Fecha:** 2026-09-23
- **Fuentes:** `src/features/ai/claude.ts`, `src/features/ai/claude-protocol.ts`, `src/lib/env.server.ts`, `scripts/ai-smoke-claude.mjs`

## Contexto

Se pidió pasar la IA del proyecto a Claude y dejarlo como proveedor por defecto. La capa ya estaba preparada: el puerto de `types.ts` y el selector de `provider.server.ts` existen desde el ADR 0031, y agregar un tercer adaptador no exige tocar nada de la orquestación.

Lo que sí hubo que revisar son dos decisiones del ADR 0031 que no se trasladan tal cual.

## Decisión

### Se usa el SDK oficial `@anthropic-ai/sdk`, no `fetch`

El ADR 0031 decidió `fetch` sin dependencia para OpenRouter. Para Claude se toma la decisión contraria, por tres motivos:

1. **La guía oficial de la API de Claude lo exige** para proyectos TypeScript, y desaconseja expresamente escribir HTTP crudo cuando existe SDK.
2. **El protocolo de streaming de Anthropic es más complejo** que el de OpenAI: eventos `message_start`, `content_block_start`, `content_block_delta` con variantes (`text_delta`, `thinking_delta`, `input_json_delta`), `content_block_stop`, `message_delta`, `message_stop`. Escribirlo a mano es donde se cuelan los errores.
3. **El motivo que descartó el SDK de OpenAI no se repite.** Aquel reintentaba por defecto, contra el [ADR 0017](0017-politica-de-thinking-y-reintentos-gemini.md); el de Anthropic acepta `maxRetries: 0` en el constructor, así que la política se respeta igual.

El principio KISS del proyecto es "cada pieza de complejidad debe pagar su costo": acá la dependencia lo paga, porque evita reimplementar un protocolo con más aristas que el anterior.

### Claude es el proveedor por defecto

`AI_PROVIDER` pasa a valer `claude` si no se define. Gemini y OpenRouter siguen disponibles sin cambios y el esquema de entorno sigue exigiendo solo la configuración del proveedor activo.

`CLAUDE_MODEL` **sí lleva valor por defecto**, `claude-opus-5`, a diferencia de `OPENROUTER_MODEL`: el catálogo de Anthropic es estable y sus identificadores no caducan de un mes al otro.

### Dos diferencias de la API que obligan a traducir, no solo a mapear

| Asunto | Gemini / OpenRouter | Claude |
| :--- | :--- | :--- |
| Aleatoriedad de la generación | `temperature` por función | **`temperature` se rechaza con un 400** en los modelos actuales. Se sustituye por `output_config.effort`, definido por función en `CLAUDE_EFFORT`: bajo para las tareas mecánicas, medio para el chat y el tono |
| Presupuesto de salida | `maxOutputTokens` es todo para la respuesta | El razonamiento **comparte** ese presupuesto. Los topes pensados para un modelo sin razonamiento visible truncan la respuesta, así que se aplica un piso de 4096 (`claudeMaxTokens`). `max_tokens` es un techo, no un cargo: subirlo no cuesta si no se usa |
| Llamadas a herramienta en streaming | Gemini las trae completas por chunk; OpenRouter troceadas y solo validables al final | Troceadas como `input_json_delta`, pero **completas al cerrar su bloque**: la propuesta se emite en el acto, como con Gemini. El chat vuelve a intercalar texto y tarjetas |
| Bloqueo por contenido | `finishReason` de seguridad / `finish_reason: "content_filter"` | `stop_reason: "refusal"`, que se traduce a `blocked` y al publicar rechaza el artículo |

El razonamiento queda activo (adaptativo, que es el modo por defecto del modelo) con el esfuerzo graduado por función. Se descartó desactivarlo: la guía oficial advierte que con el razonamiento apagado el modelo a veces escribe la llamada a herramienta como texto visible en vez de emitirla como tal, que en el chat del editor significa una propuesta que nunca aparece.

La traducción del protocolo vive en `claude-protocol.ts`, sin `server-only` y sin I/O, para poder probarla sin red, igual que `openrouter-protocol.ts` y `function-calls.ts`.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| `fetch` crudo, por coherencia literal con el ADR 0031 | Va contra la guía oficial de la API y obliga a reimplementar a mano un protocolo de streaming con más tipos de evento |
| Desactivar el razonamiento para abaratar | La guía advierte de dos fallos conocidos con el razonamiento apagado: llamadas a herramienta escritas como texto y etiquetas internas filtradas a la respuesta. Bajar el esfuerzo consigue el ahorro sin esos riesgos |
| Un modelo más barato por defecto (Haiku 4.5, Sonnet 5) | La guía indica usar el modelo más capaz salvo pedido explícito, y el ahorro no lo decide quien escribe el código. Queda a una variable de entorno de distancia |
| Mantener Gemini por defecto y dejar Claude opcional | El pedido fue explícito: Claude por defecto |

## Consecuencias

- **A favor:** el puerto queda demostrado con tres implementaciones. El chat recupera el orden natural de Gemini (texto y tarjetas intercalados), que con OpenRouter se había perdido. El contexto de 1M tokens elimina el riesgo de truncar artículos largos.
- **En contra:** una dependencia más que mantener, y una asimetría a la vista: `FEATURE_CONFIG` define una temperatura que este adaptador ignora. Queda anotado en ese archivo para que no se lea como un olvido.
- **Costo:** `claude-opus-5` cuesta más por token que las alternativas usadas hasta ahora. Lo contienen los mecanismos que ya existen: caché de resultados en la fila del post, límite por minuto en dos carriles y topes por función.
- **Verificación:** `pnpm ai:smoke:claude` comprueba contra la API real que el modelo existe, que la salida estructurada funciona por las dos vías (esquema JSON crudo y `messages.parse` con `zodOutputFormat`, que es la que usa el adaptador) y que el streaming con function calling devuelve una propuesta utilizable.
- **Cuándo revisar:** si cambia la política de `temperature` o de razonamiento de los modelos, si el gasto obliga a bajar de modelo, o si el piso de `max_tokens` resulta corto para alguna función.
