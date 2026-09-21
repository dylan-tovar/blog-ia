# PRD-8.2 — Chat de IA: panel lateral, mensajes y atajos

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-8 — Chat de IA del editor](PRD-8-ai-chat.md) |
| Dificultad / Esfuerzo | M (media) / M (2 a 3 días) |
| Dueño sugerido / Mentor | D2 / — |
| Depende de | [PRD-8.1](PRD-8.1-chat-server.md) (el servidor), [PRD-2.2](PRD-2.2-editor-tiptap.md) (el editor donde vive), [PRD-0.2](PRD-0.2-ui-primitives.md) (`Message`, `Bubble`, `Marker`) |
| Alimenta a | [PRD-8.4](PRD-8.4-action-cards-analysis.md) (las tarjetas viven dentro de los mensajes) |
| Código | `src/features/ai/components/chat/{AiChatDrawer,ChatMessages,ChatMessage,ChatComposer,QuickActions,ai-drawer,use-ai-drawer-shortcut,use-auto-scroll,use-chat,chat-client}.ts(x)`, `src/features/ai/components/{use-ai-request,ai-client,ai-ui,AiErrorMessage,use-countdown}.ts(x)`, y el cableado en `src/features/posts/components/PostEditor.tsx` |
| ADRs | [0013](../adr/0013-chat-ia-protocolo-ndjson-y-function-calling.md), [0011](../adr/0011-ia-con-gemini.md) |

## Resumen

Todo lo que el autor **ve y toca** del asistente: un panel lateral (`Cmd/Ctrl+I`) con un campo para escribir, la lista de mensajes que llegan en *streaming*, cuatro atajos de "herramientas" (Estructura, Títulos, Tono, Analizar), el botón Detener y el manejo de errores con "Reintentar". También es el pegamento entre la pantalla y el servidor: `use-chat` administra la conversación y `chat-client` lee el stream. Las tarjetas de propuesta y de análisis que aparecen dentro de los mensajes son de [PRD-8.4](PRD-8.4-action-cards-analysis.md).

## Qué necesitás entender antes

- [ ] React: `useState`, `useCallback`, `useRef`, `useEffect`, componentes controlados.
- [ ] Qué es **streaming** en el navegador (`fetch` + `ReadableStream`) y por qué el texto aparece mientras se genera.
- [ ] Accesibilidad básica: `aria-live`, `inert`, foco (a dónde va el cursor al abrir o cerrar un panel).
- [ ] Atajos de teclado: qué es la **fase de captura** (`addEventListener(..., true)`) y por qué se usa aquí.
- [ ] Tailwind y `clamp()` (el ancho del panel es fluido).
- [ ] Glosario: [docs/README.md](../README.md#glosario) (drawer, acción rápida, snapshot).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| El panel, su apertura, foco, atajo y persistencia de "abierto" | Las tarjetas de propuesta, la de análisis y la lista de pasos: [PRD-8.4](PRD-8.4-action-cards-analysis.md) |
| La lista de mensajes, la bienvenida, el campo de mensaje y la barra de atajos | El servidor y el protocolo: [PRD-8.1](PRD-8.1-chat-server.md) |
| `use-chat` (estado y envío), `chat-client` (lectura del stream) y el "cupo único" de peticiones | Aplicar propuestas en el editor (`EditorBridge`): [PRD-8.3](PRD-8.3-editor-context-apply.md) |
| Errores con "Reintentar" y cuenta regresiva | El editor Tiptap: [PRD-2.2](PRD-2.2-editor-tiptap.md) |

## Cómo funciona

Orden de lectura sugerido: `PostEditor.tsx` (dónde se monta) → `AiChatDrawer.tsx` → `ChatComposer.tsx` → `use-chat.ts` → `chat-client.ts` → `ChatMessages.tsx` / `ChatMessage.tsx` → `QuickActions.tsx` → `use-ai-request.ts`.

### 1. El panel (`AiChatDrawer`)

Un `<aside>` con `position: sticky` a la derecha del editor. **Empuja** al artículo (el artículo se reacomoda al ancho restante) en vez de taparlo. Detalles:

- **Ancho fluido:** `w-[clamp(24rem,32vw,34rem)]`. El contenedor exterior anima el ancho y el interior **conserva el ancho final** para que el contenido no se reacomode durante la animación.
- **Cerrado:** `w-0` y `inert`, así el teclado y los lectores de pantalla no entran.
- **Foco:** al abrir, el foco va al campo de mensaje (`useEffect`); al cerrar con el foco dentro, `PostEditor.setDrawer` lo devuelve al editor.
- **Altura:** `top-(--editor-header-h)` y `h-[calc(100svh-var(--editor-header-h))]`; la cabecera del panel (`h-11`) se alinea con la barra de herramientas del editor. La variante `short` (alto menor a 600 px) reduce paddings.
- **Aviso fijo** bajo el campo: "El texto se envía a Google Gemini. En la capa gratuita, Google puede usarlo para mejorar sus productos."

### 2. Abrir, cerrar y recordar

- Botón "IA" de la barra superior (`EditorTopBar`) o `Cmd/Ctrl+I` (`use-ai-drawer-shortcut.ts`). El atajo se registra en fase de **captura** en `window` y hace `preventDefault` + `stopPropagation` para que ni ProseMirror ni el navegador lo vean.
- `Cmd/Ctrl+I` era la cursiva de Tiptap: ahora la cursiva queda solo en `Cmd/Ctrl+Shift+I` (`use-article-editor.ts`, extensión `ShiftItalic`).
- El estado abierto/cerrado se guarda en `localStorage` (`editor:ai-drawer-open`, `ai-drawer.ts`), con `try/catch` porque el almacenamiento puede no estar disponible. **La conversación no se guarda.**

### 3. La conversación (`use-chat.ts`)

`useChat({ runSlot, busy, bridge })` mantiene `entries` (mensajes) en memoria. Al enviar un mensaje:

```text
send(texto):
  ignorar si está vacío o hay otra petición en vuelo (busy)
  stream([...historial, mensaje del usuario]):
    crear una respuesta vacía "streaming"
    snapshot = bridge.getSnapshot()            <- foto del editor AL ENVIAR
    runSlot(streamChat({...toRequestContext(snapshot), messages}, handlers))
      onDelta    -> agregar texto
      onStep     -> actualizar pasos y plan
      onAction   -> agregar tarjeta (guarda el snapshot con el que se hizo la propuesta)
      onAnalysis -> guardar el análisis
    al terminar: settleReply (éxito, error o detenido)
```

`retry` reenvía el último mensaje del autor (borra antes la respuesta fallida) y `stop` aborta la petición: conserva lo ya recibido; si no llegó nada, la respuesta desaparece y no se muestra error. `applyAction`, `applyAll`, `discardAction` y `undoAction` llaman a `bridge.apply/undo` y actualizan el estado ([PRD-8.4](PRD-8.4-action-cards-analysis.md) y [PRD-8.3](PRD-8.3-editor-context-apply.md)). Un detalle de diseño: el editor se toca **fuera** de los actualizadores de estado de React para que un nuevo render no aplique un cambio dos veces.

### 4. Leer el stream (`chat-client.ts`)

`streamChat` hace `fetch('/api/ai/chat')` y distingue por el `Content-Type`: si es `application/x-ndjson`, lee el stream con el analizador de líneas; si no, la respuesta es un JSON de error previo al stream. **Nunca lanza**: todo fallo (red, JSON no válido, cancelación) se convierte en un error tipado. Si la conexión se cierra sin evento `done`, la respuesta se trata como cortada (con "Reintentar").

### 5. El cupo único de peticiones (`use-ai-request.ts`)

`useAiRequest` es propiedad de `PostEditor`. `runSlot` mantiene **una sola petición de IA en vuelo para todo el editor**: una nueva cancela la anterior, y solo la última libera `busy`. Mientras `busy`, no se puede enviar ni usar atajos. (`run`/`callAiRoute` son del código deprecado, [PRD-5.4](PRD-5.4-ai-route-runner.md); solo `runSlot` importa hoy.)

### 6. Mensajes y bienvenida

- **Sin mensajes:** una cuadrícula de 4 herramientas (`QuickActionsGrid`) y 3 consultas sugeridas.
- **`ChatMessage`:** los del usuario son burbujas a la derecha. Los del asistente muestran: "Pensando…" hasta el primer dato, texto en Markdown que aparece mientras llega (con un cursor parpadeante), las tarjetas ([PRD-8.4](PRD-8.4-action-cards-analysis.md)), el error con "Reintentar" y un pie con "Copiar", la hora y, cuando parece contenido de artículo, "Insertar en cursor" / "Insertar al final".
- **`cleanChatContent`** quita los ids internos `[b0]`… si el modelo los filtra. **`isInsertableContent`** decide con expresiones regulares en español si una respuesta parece contenido insertable.
- **Auto-scroll** (`use-auto-scroll.ts`): sigue el final mientras llega texto, salvo que el autor haya subido para leer; enviar un mensaje retoma el seguimiento.
- La región de mensajes es `aria-live="polite"` y queda montada (vacía) para anunciar también la primera respuesta.

### 7. La barra de atajos (`QuickActions`)

Siempre sobre el campo: **Estructura**, **Títulos**, **Tono** (Informal / Formal / Investigación) y **Analizar**. **No llaman a rutas propias**: cada una envía un mensaje predefinido al chat mediante `handleOutlineTool`, `handleTitlesTool`, `handleToneTool` y `handleScoreTool` de `PostEditor.tsx`. Se deshabilitan en vista previa o sin editor.

### 8. El campo de mensaje (`ChatComposer`)

`Enter` envía, `Shift+Enter` agrega línea (`shouldSubmitOnEnter` no envía durante una composición IME; `keyCode 229` es lo que Safari reporta al confirmar una). Máximo 4000 caracteres. Mientras responde, el botón de enviar se convierte en "Detener respuesta".

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Un chat en lugar de cuatro diálogos** (consta: tener modales sobre la pantalla no tenía sentido con un panel de chat ya existente; el resultado en el chat permite seguir preguntando) | Mantener los diálogos ([PRD-5](PRD-5-ai-author.md)); un menú desplegable (`AiMenu`, eliminado) | Las herramientas viejas quedaron sin uso ([ADR 0019](../adr/0019-rutas-legacy-de-ia-deprecadas.md)) |
| **Panel que empuja al artículo** | Superponerlo | El autor sigue viendo su texto mientras chatea |
| **Atajo en fase de captura** (comentario en `use-ai-drawer-shortcut.ts`) | Atajo normal de React | ProseMirror no lo intercepta. Costo: la cursiva pasa a `Cmd/Ctrl+Shift+I` |
| **Conversación solo en memoria** (el código lo declara "por diseño") | Guardarla en la base | Se pierde al recargar; no hay tablas ni retención de contenido enviado a un tercero † |
| **Un solo cupo de petición en vuelo** | Permitir varias | Una nueva cancela la anterior; menos gasto de cuota y sin respuestas cruzadas |
| **Foto del editor (`snapshot`) al enviar, no al aplicar** (comentario en `use-chat.ts`) | Leer el editor al aplicar | Cada propuesta recuerda contra qué versión se hizo ([PRD-8.3](PRD-8.3-editor-context-apply.md)) |
| **El estado "abierto" en `localStorage`, con `try/catch`** | Cookie o base de datos | Conveniencia por usuario; si falla, el panel sigue funcionando |
| **Tailwind fluido con `clamp()` y `svh`** | Anchos fijos | Se adapta a pantallas de distintos tamaños |

## Criterios de aceptación

- [ ] `Cmd/Ctrl+I` abre y cierra el panel; la cursiva sigue funcionando con `Cmd/Ctrl+Shift+I` y con el botón.
- [ ] Al abrir, el foco va al campo; al cerrar con el foco dentro, vuelve al editor.
- [ ] Recargar la página conserva si el panel estaba abierto; la conversación se pierde.
- [ ] El artículo se estrecha junto al panel; no queda debajo.
- [ ] Enter envía, Shift+Enter agrega línea, y no se envía en medio de una composición IME.
- [ ] El texto llega en *streaming*; aparece "Pensando…" hasta el primer dato.
- [ ] "Detener" conserva el texto recibido; un stream cortado ofrece "Reintentar".
- [ ] Con límite de peticiones se ve una cuenta regresiva y "Reintentar" queda deshabilitado hasta que termina.
- [ ] Los atajos envían el mensaje predefinido al chat y se deshabilitan en vista previa.
- [ ] El chat nunca muestra ids `[bN]`.

## Cómo verificarla a mano

1. `pnpm test`: `chat-state.test.ts`, `chat-client.test.ts`, `ai-drawer.test.ts`, `ai-ui.test.ts`, `ai-client.test.ts`.
2. `pnpm dev`, iniciá sesión, `/editor/new`, escribí un párrafo y `Cmd/Ctrl+I`.
3. Recargá con el panel abierto: debe seguir abierto.
4. Con `AI_RATE_LIMIT_USER_PER_MIN=1`, enviá dos mensajes seguidos: el segundo muestra la cuenta regresiva.
5. Enviá un mensaje y pulsá "Detener" a mitad.
6. Cambiá el ancho de la ventana y comprobá que no hay desbordes horizontales.
7. `pnpm test:e2e -- editor-ai-drawer.spec.ts` simula el servidor: ojo, **hoy no pasa el `beforeEach`** ([PRD-X.1](PRD-X.1-testing-e2e.md)).

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| El servidor **no avisa** si el artículo era demasiado largo y el modelo solo vio una parte: mostrar un aviso en la interfaz cuando `totalBlocks` supere lo enviado (`toRequestContext`) | M |
| `AiChatDrawer` conserva la ranura `analysis` y `QuickActions` la propiedad `scoreOpen` del panel de puntaje viejo; `PostEditor` no los pasa: eliminarlos | B |
| `isInsertableContent` decide con expresiones regulares en español; puede acertar mal en respuestas cortas: revisar con más casos y más pruebas | M |
| `use-chat.ts` y los componentes del panel no tienen pruebas unitarias (solo e2e con el servidor simulado). Vitest corre en entorno `node` y solo incluye `src/**/*.test.ts`; `jsdom` está instalado pero sin configurar. Opciones: extraer más lógica pura o habilitar un entorno de DOM para componentes | A |
| Textos del panel repetidos en español dentro de los componentes: agruparlos en un archivo de textos | B |
| El comentario de `AiErrorMessage.tsx` cita los contenedores legacy: actualizarlo ([PRD-5.4](PRD-5.4-ai-route-runner.md)) | B |
| Corregir el e2e roto (`createDraft`) ([PRD-X.1](PRD-X.1-testing-e2e.md)) | M |

## Preguntas de autoevaluación

1. ¿Por qué el atajo se registra en fase de captura y qué hubo que cambiar en el editor por eso?
2. ¿Qué hace `runSlot` y qué pasa si el autor envía un mensaje mientras otro está respondiendo?
3. ¿Por qué `chat-client` distingue la respuesta por el `Content-Type`?
4. ¿Por qué el snapshot se toma **al enviar** el mensaje y no al aplicar la propuesta?
5. ¿Qué pasa exactamente cuando el autor pulsa "Detener"?
6. ¿Qué diferencia hay entre un atajo como "Estructura" y escribir el mismo pedido a mano?
