# 0034. Moderación de imágenes con IA en la publicación

- **Estado:** Aceptada. Extiende la moderación del [ADR 0011](0011-ia-con-gemini.md) a las imágenes del artículo.
- **Fecha:** 2026-09-23
- **Fuentes:** [ADR 0011](0011-ia-con-gemini.md), [ADR 0022](0022-imagenes-en-supabase-storage.md), [ADR 0031](0031-proveedor-de-ia-intercambiable-openrouter.md); `src/features/ai/`, `src/features/posts/actions.ts`, `src/features/posts/publish.ts`

## Contexto

`publishPost` moderaba título y contenido de texto (diccionario determinista y luego IA, [ADR 0032](0032-diccionario-de-moderacion-en-el-editor.md)), pero ninguna imagen del artículo pasaba por ningún chequeo: `uploadPostImage` sube directo a Storage tras validar tamaño y formato ([ADR 0022](0022-imagenes-en-supabase-storage.md)), y `savePostCover` ni siquiera pasa por el gate de publicación.

No existe un equivalente del diccionario para imágenes: juzgar contenido visual nuevo (no ya catalogado) requiere necesariamente un modelo de visión, no hay atajo determinista posible.

## Decisión

### Se suma a la misma llamada de `moderateArticle`, no una aparte

Igual que el texto, las imágenes se revisan en `publishPost`, dentro de la misma llamada a la IA que ya modera título y contenido — no una llamada por imagen, ni un chequeo al subirla. Subir una imagen no cuesta cuota de IA; solo la cuesta un intento de publicación, igual que el texto. Esto también evita que una imagen ofensiva subida a un borrador que nunca se publica gaste nada.

### Alcance: portada y cuerpo

Se revisan `cover_image_url` y las imágenes insertadas en el markdown (`![alt](url)`), extraídas con `extractImageUrls` (`@/features/posts/cover/cover`, ya usada por `PublishDialog` para listar imágenes del cuerpo). `buildModerationImages` (`src/features/posts/publish.ts`) arma la lista: la portada primero (si existe), después las del cuerpo en orden de aparición, sin duplicar la portada si también está insertada en el cuerpo.

### Solo Gemini; OpenRouter se degrada, no se cae

El proveedor de IA es intercambiable ([ADR 0031](0031-proveedor-de-ia-intercambiable-openrouter.md)). Agregar visión al adapter de Gemini es un cambio chico: el SDK ya acepta partes de imagen (`inlineData`) en `generateContent`, solo hacía falta ensanchar el tipo de `contents` (`GenerateInput.contents: string | AiContentPart[]`, `src/features/ai/types.ts`) y mapearlo en `gemini.ts`. Armar el formato multipart de OpenRouter/OpenAI desde cero era bastante más trabajo para un proveedor que hoy no está activo.

Como `GenerateInput` es compartido entre proveedores, el adapter de OpenRouter tenía que al menos compilar y comportarse razonablemente si le llega un array de `AiContentPart`: `toMessages` (`openrouter-protocol.ts`) descarta las partes de imagen y manda solo el texto, y `callModel` (`openrouter.ts`) loguea cuántas se descartaron (mismo patrón que ya existe para `droppedToolCalls`). Si un deployment corre con `AI_PROVIDER=openrouter`, el texto se sigue moderando igual; las imágenes quedan sin revisar hasta que se implemente ahí también.

### El prompt lleva las imágenes etiquetadas, no numeradas a ciegas

`buildModerationPrompt` recibe `images: { label: string; part: AiContentPart }[]` ya resuelto por quien arma la lista (`buildModerationImages` sabe cuál es la portada), no un array plano que obligue a adivinar por posición. Sin imágenes, `contents` sigue siendo el mismo string de siempre — cero cambio de comportamiento para el resto de las features. El `reason` de un rechazo usa esa misma etiqueta ("la portada", "la imagen 1 del cuerpo") para que el autor sepa cuál es.

### Tope de imágenes y fallo de red

`MAX_MODERATION_IMAGES` (6) acota cuántas imágenes se revisan por intento de publicación, para no armar un request desmedido en un artículo con muchísimas. Es una limitación conocida, documentada acá, no una validación que rechace la publicación: solo se revisan las primeras.

Bajar cada imagen desde Storage tiene su propio timeout (`MODERATION_IMAGE_FETCH_TIMEOUT_MS`, 5s) y valida el `Content-Type` contra los formatos aceptados en el upload (`IMAGE_ACCEPTED_TYPES`). Una imagen con un tipo no permitido se descarta sin abortar las demás. Si el fetch falla por red o timeout, `moderateArticle` lo trata igual que cualquier otra caída del proveedor (`AiError("unavailable")`): publica sin tags de IA en vez de trabar al autor por un problema de infraestructura ajeno a su contenido.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Revisar al momento de subir la imagen | Gasta una llamada a IA por cada imagen subida, aunque el post nunca se publique; cambio de flujo más grande |
| Una llamada de IA por imagen | Multiplica la cuota consumida y el tiempo de publicación por la cantidad de imágenes; una sola llamada con todas las partes es más barata y más simple |
| Implementar visión también en OpenRouter desde el arranque | Bastante más trabajo (formato multipart de OpenAI end-to-end) para un proveedor que hoy no está activo; queda para cuando haga falta |
| Hashing perceptual contra imágenes catalogadas | Solo detecta reincidencia de contenido ya conocido (tipo PhotoDNA), no juzga contenido nuevo; complementario, no sustituto |

## Consecuencias

- **A favor:** cierra un hueco real (ninguna imagen se revisaba); reusa la infraestructura de moderación existente (`moderateArticle`, el carril de rate limit `"moderation"`) sin gastar cuota extra en borradores.
- **En contra:** con más de `MAX_MODERATION_IMAGES` imágenes, las que exceden el tope no se revisan. Con `AI_PROVIDER=openrouter`, las imágenes no se revisan en absoluto (el texto sí).
- **Cuándo revisar:** si se decide dar soporte de visión a OpenRouter, si el tope de imágenes resulta insuficiente en la práctica, o si conviene mostrarle al autor una miniatura junto al motivo de rechazo en vez de solo la etiqueta de texto.

## Actualización (2026-09-23)

Claude pasó a ser un tercer proveedor y luego el proveedor por defecto ([ADR 0033](0033-claude-como-proveedor-por-defecto.md)), y su adapter (`claude.ts`) también recibió soporte real de visión: `toClaudeContent` (`claude-protocol.ts`) mapea `AiContentPart[]` al bloque de imagen de Anthropic (`source.media_type` anidado, distinto del `inlineData` de Gemini). La sección "Solo Gemini; OpenRouter se degrada, no se cae" sigue describiendo correctamente el diseño (un tercer proveedor puede sumarse sin tocar la orquestación) pero ya no es exacta en el alcance: hoy la moderación de imágenes funciona con Gemini y con Claude, y solo se degrada con gracia en OpenRouter.
