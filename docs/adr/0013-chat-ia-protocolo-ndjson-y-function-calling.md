# 0013. Chat de IA del editor: protocolo NDJSON y function calling

- **Estado:** Aceptada. Reemplaza la parte de [ADR 0011](0011-ia-con-gemini.md) que definía las herramientas del editor como diálogos independientes sobre Route Handlers JSON (el resto de 0011 sigue vigente).
- **Fecha:** 2026-09-20 (escrito después de implementar; los motivos salen de los comentarios del código y de los tests, no de una discusión registrada)
- **Fuentes:** [PRD-8](../prds/PRD-8-ai-chat.md), [PRD-5](../prds/PRD-5-ai-author.md), `src/features/ai/` (`stream-protocol.ts`, `stream-response.ts`, `function-calls.ts`, `chat-stream.ts`, `gemini.ts`, `handlers.server.ts`), `src/app/api/ai/chat/route.ts`

## Contexto

PRD-5 pedía cuatro herramientas para el autor (outline, títulos, tono, score), cada una como un diálogo que llama a su Route Handler y devuelve un JSON. En la práctica, abrir un modal por herramienta obligaba al autor a salir de la conversación con el texto: la IA necesita ver el artículo, responder en lenguaje natural y **proponer cambios concretos** que el autor decide aplicar. Eso exige respuestas en streaming y salidas estructuradas (ediciones, análisis) dentro de la misma respuesta.

## Decisión

Un solo endpoint, `POST /api/ai/chat`, responde con un stream **NDJSON** (`application/x-ndjson`, `Cache-Control: no-store`): un objeto JSON por línea, con estos eventos.

| Evento | Contenido |
| :--- | :--- |
| `delta` | Fragmento de texto de la respuesta |
| `step` | Paso de progreso (`id`, `label`, `status`: `pending`, `running`, `done`) |
| `action` | Una propuesta de edición validada (`EditAction`) |
| `analysis` | Una auditoría editorial completa (`ArticleAnalysis`) |
| `error` | Fallo tipado (`kind`, `message`, `retryAfter?`, `scope?`) |
| `done` | Fin normal del stream |

Reglas del protocolo:

- **Dos formas de fallar.** Todo lo que falla antes de abrir el stream (Origin, sesión, tamaño, Zod, límite por minuto) responde JSON tipado con `{ ok: false, error }`; después de abrirlo, el fallo viaja como línea `error`. El cliente distingue ambos casos por el `Content-Type`. El límite por minuto corre **antes** de crear el stream justamente para poder contestar JSON.
- **Compatible hacia adelante.** El parser (`createNdjsonParser`) ignora las líneas de un tipo desconocido o mal formadas, así un servidor nuevo puede agregar eventos sin romper a un cliente viejo. Si la conexión se cierra sin `done`, el cliente trata la respuesta como cortada.
- **Stream por demanda (pull).** El generador solo avanza mientras el cliente lee; si el cliente cancela, se aborta la llamada a Gemini en vez de dejarla corriendo.
- **La petición trae el estado vivo del editor, no un id de post:** `title`, `blocks` (`b0`, `b1`… con tipo, nivel y markdown), `totalBlocks`, `selection`, `fingerprint` y `messages`. El artículo puede ser un borrador que todavía no existe en la base. El historial se recorta a 12 turnos y 16 000 caracteres en el cliente y otra vez en el servidor; la conversación vive solo en memoria del cliente y se pierde al recargar, a propósito.
- **Function calling en modo `AUTO`** con dos herramientas declaradas: `propose_edit` (seis operaciones: `insert_after_block`, `insert_at_selection`, `append`, `replace_block`, `replace_selection`, `replace_range`) y `present_analysis` (puntaje 0–100, cinco métricas, veredicto, fortalezas, debilidades y mejoras). Son llamadas **terminales**: el resultado se muestra al autor y nunca se le devuelve al modelo como `functionResponse`. El esquema de `propose_edit` es plano a propósito, porque un `oneOf` por operación resulta menos fiable con function calling; los campos obligatorios por operación se explican en las descripciones y se imponen después con `editActionSchema`.
- **El servidor no confía en el modelo.** `runChatStream` valida cada acción contra los bloques que el modelo realmente vio (los que sobrevivieron al recorte por bloques enteros), descarta las inválidas (`unknown_block`, `bad_range`, `no_selection`), admite como máximo 8 acciones por turno y agrega pasos determinísticos (`read`, `analyze`, `propose`). Una respuesta sin texto, sin acción válida y sin análisis falla con `invalid_response`: una burbuja vacía es peor que un error que se puede reintentar.
- **Los identificadores `[bN]` son internos.** El prompt prohíbe mencionarlos al autor; sirven solo como parámetros de las herramientas.
- **Mismo carril de límite que la asistencia** (`assist`): cada mensaje del chat cuenta como una petición.

Brecha conocida: `update_plan` (pasos de un plan propuesto por el modelo) está tratado en `modelPartsToStreamParts` y en el estado del cliente, pero **no** figura en `CHAT_TOOL_DECLARATIONS` ni en la instrucción de sistema, así que hoy el modelo no puede emitirlo y solo se ven los pasos determinísticos. El campo `fingerprint` de la petición se valida con Zod pero el servidor no lo usa (ver [ADR 0014](0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)).

## Alternativas consideradas

Las marcadas con † son razonamiento reconstruido a partir del código, no una discusión registrada.

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Mantener un diálogo por herramienta (ADR 0011) | Saca al autor de la conversación y no puede proponer cambios aplicables en el texto |
| Server Actions para el chat | Se despachan de a una y bloquearían el autosave durante varios segundos (misma razón que en ADR 0011); además no exponen un stream de eventos tipados † |
| Server-Sent Events (`text/event-stream`) † | `EventSource` solo hace GET y el cuerpo con el estado del editor no cabe en una URL; NDJSON sobre `fetch` con POST se parsea con unas pocas líneas |
| WebSockets † | Infraestructura y ciclo de vida de conexión que un stream unidireccional de una sola respuesta no necesita |
| Respuesta única en JSON (sin stream) | El autor esperaría en blanco decenas de segundos; el stream muestra el texto y los pasos a medida que llegan |
| Pedir al modelo un JSON con las ediciones dentro del texto † | Frágil de parsear; function calling da argumentos ya estructurados que se validan con Zod |
| Enviar solo el `postId` y cargar el artículo en el servidor † | No cubre el borrador sin guardar ni la selección actual; el estado vivo evita una lectura y refleja lo que el autor ve |

## Consecuencias

- **A favor:** una sola superficie de IA para el autor, con respuestas que aparecen mientras se generan; cada propuesta es una tarjeta que el autor aplica o descarta ([ADR 0014](0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)); un cliente viejo tolera eventos nuevos.
- **En contra:** el chat no consulta la base: cualquier usuario autenticado puede enviar texto arbitrario al modelo (acotado por el límite por minuto y por 200 KB de cuerpo), así que no es una función restringida al dueño del artículo. La conversación no persiste. Los eventos no llevan versión explícita: la compatibilidad depende de que el parser siga ignorando lo desconocido.
- **Cuándo revisar:** si se persiste el historial, si se declara `update_plan` o se elimina su manejo, si hace falta cancelar o reanudar una respuesta a mitad, o si el volumen justifica un transporte con reconexión.
