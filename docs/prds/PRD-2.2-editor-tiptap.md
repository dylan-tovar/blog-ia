# PRD-2.2 — Editor de artículos (Tiptap y markdown)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-2 — Posts](PRD-2-posts.md) |
| Dificultad / Esfuerzo | A (avanzada) / L (más de 3 días) |
| Dueño sugerido / Mentor | D2 / — |
| Depende de | [PRD-0.2](PRD-0.2-ui-primitives.md) (botones, menús, diálogos) |
| Lo usan | [PRD-2.3](PRD-2.3-autosave-drafts.md) (guardar), [PRD-2.4](PRD-2.4-publish-dialog-tags.md) (publicar), [PRD-8.2](PRD-8.2-chat-drawer-ui.md) y [PRD-8.3](PRD-8.3-editor-context-apply.md) (chat de IA) |
| Código | `src/features/posts/components/editor/use-article-editor.ts`, `EditorToolbar.tsx`, `safe-link.ts`; `src/features/posts/link-safety.ts`; `src/features/posts/components/PostEditor.tsx` (ensamblaje), `MarkdownContent.tsx`, `markdown-styles.ts`; `src/app/(editor)/editor/[id]/page.tsx`, `src/features/posts/components/DesktopOnly.tsx` |
| ADRs | [0010](../adr/0010-editor-markdown.md) |

## Resumen

El editor donde se escriben los artículos: una pantalla completa con barra de formato, título aparte y vista previa. Usa **Tiptap** (un editor "rico" basado en ProseMirror) pero lo que se guarda es **markdown**, texto plano portable. Es la pieza más delicada de la interfaz: si el paso *markdown → editor → markdown* pierde o corrompe contenido, el autor pierde su trabajo.

## Qué necesitás entender antes

- [ ] Qué es **markdown** y su sintaxis básica (`##`, `**negrita**`, listas, enlaces, tablas).
- [ ] React: componentes cliente (`"use client"`), `useState`, `useEffect`, hooks propios.
- [ ] La idea de un **editor rico**: el editor mantiene un documento estructurado (árbol de bloques) y el markdown es una representación de ese árbol. Buscá "ProseMirror document model".
- [ ] Extensiones de Tiptap: cada capacidad (negrita, tablas, enlaces) es una extensión que se registra.
- [ ] Seguridad web básica: por qué un enlace `javascript:alert(1)` es peligroso (XSS).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Configuración de Tiptap y sus extensiones (`use-article-editor.ts`) | Cuándo y cómo se guarda: [PRD-2.3](PRD-2.3-autosave-drafts.md) |
| Barra de formato (`EditorToolbar`), título, vista previa | Diálogo de publicar y tags: [PRD-2.4](PRD-2.4-publish-dialog-tags.md) |
| Enlaces seguros (`SafeLink`, `link-safety.ts`) | El chat de IA y cómo aplica cambios al documento (`editor-bridge`, `apply-action`): [PRD-8.3](PRD-8.3-editor-context-apply.md) |
| Que el editor solo se monte en pantallas anchas (`DesktopOnly`) | La lectura pública del artículo: [PRD-2.6](PRD-2.6-post-detail.md) (comparte `MarkdownContent`) |

## Cómo funciona

Orden de lectura sugerido: `page.tsx` → `PostEditor.tsx` → `use-article-editor.ts` → `EditorToolbar.tsx` → `safe-link.ts` + `link-safety.ts` → `MarkdownContent.tsx`.

### 1. La página y `DesktopOnly`

`src/app/(editor)/editor/[id]/page.tsx` recibe `id`. Si es `"new"` arma un post vacío en memoria (**no crea nada en la base**: eso lo hace el autoguardado, ver [PRD-2.3](PRD-2.3-autosave-drafts.md)); si no, llama a `getOwnPost(id)`. Envuelve todo en `DesktopOnly`, que **no monta** a sus hijos por debajo del breakpoint `md` y muestra "Editá artículos desde una computadora". Así, en el móvil el editor (y su autoguardado) directamente no corre.

### 2. `PostEditor`: quien ensambla

`PostEditor.tsx` es el "director de orquesta" (265 líneas). Guarda el estado del título, el contenido, el status y los tags, y conecta: `useAutosave` ([2.3](PRD-2.3-autosave-drafts.md)), `useArticleEditor` (este paquete), `EditorTopBar` y `PublishDialog` ([2.4](PRD-2.4-publish-dialog-tags.md)) y el `AiChatDrawer` ([8.2](PRD-8.2-chat-drawer-ui.md)). El título **no** es parte de Tiptap: es un `<textarea>` aparte (máx. 200 caracteres); `Enter` en el título mueve el foco al cuerpo. El botón "Vista previa" alterna entre el editor y `MarkdownContent`.

### 3. `useArticleEditor`: la configuración

```text
useEditor({
  extensions: [StarterKit (solo H2 y H3; sin italic/underline/link propios),
               ShiftItalic, SafeLink, Markdown, TaskList/TaskItem,
               Table*, Image (sin base64), Placeholder],
  content: initialContent, contentType: "markdown",
  onUpdate: editor.getMarkdown() -> onChange(markdown)
})
```

Puntos clave:

- **El markdown es la fuente de verdad**: al cargar se parsea (`contentType: "markdown"`) y en cada cambio se serializa (`getMarkdown()`), y ese texto es lo que se guarda en `posts.content`.
- **Solo encabezados H2 y H3**: el título del artículo es el H1 implícito.
- **`ShiftItalic`**: `Cmd/Ctrl+I` está reservado para abrir el chat de IA, así que la cursiva usa `Cmd/Ctrl+Shift+I`.
- **Tablas, imágenes y listas de tareas no tienen botón** en la barra. Están registradas igual para que un markdown que ya las tenga **sobreviva** a abrir/editar/guardar sin perderlas.
- `immediatelyRender: false` evita diferencias entre el render del servidor y del cliente (hidratación).

### 4. La barra (`EditorToolbar`)

Botones con `aria-label` en español: Deshacer, Rehacer, un menú "Estilo de bloque" con tres opciones ("Párrafo", "Título" = H2 y "Subtítulo" = H3), Negrita, Cursiva, Tachado, Código en línea, Enlace, Lista con viñetas, Lista numerada, Cita, Bloque de código y Separador. Usa `useEditorState` para saber qué formato está activo y pintar `aria-pressed`. Los botones hacen `onMouseDown={preventDefault}` para no robarle el foco al texto seleccionado. El enlace se edita en un campo aparte; `normalizeUrl` antepone `https://` si falta el protocolo (acepta `http(s)://`, `mailto:`, `/` y `#`).

### 5. Enlaces seguros

El markdown de un artículo es entrada del usuario: alguien podría escribir `[clic](javascript:alert(1))`.

- `link-safety.ts` → `isSafeLinkHref(href)`: quita espacios y caracteres invisibles del inicio (los navegadores ignoran, por ejemplo, un tabulador dentro de `java\tscript:`), lee el protocolo y solo acepta `http`, `https` y `mailto` (o ninguno, para rutas relativas).
- `safe-link.ts` → `SafeLink`: la extensión `Link` de Tiptap **no** valida la URL cuando parsea markdown; por eso se sobreescribe `parseMarkdown` para que un enlace inseguro se degrade a **texto plano**. Los enlaces salen con `rel="noopener noreferrer nofollow"` y `target="_blank"`.

### 6. La vista previa y la lectura pública

`MarkdownContent.tsx` usa **react-markdown** (no Tiptap) para renderizar el mismo markdown: sin HTML crudo, con tablas (GFM) en un contenedor desplazable, enlaces externos con `rel`, y **sin imágenes** (`disallowedElements={["img"]}`). Comparte la clase `ARTICLE_PROSE_CLASS` (`markdown-styles.ts`) con el editor para que se vean parecidos.

## Decisiones y por qué

| Decisión | Alternativas | Por qué |
| :--- | :--- | :--- |
| Tiptap con markdown como fuente de verdad ([ADR 0010](../adr/0010-editor-markdown.md)) | `<textarea>` plano; guardar el JSON de ProseMirror; HTML | El contenido es texto portable y la IA lo entiende sin convertir (consta en el ADR). Costo: hay que registrar extensiones aunque no tengan botón |
| Solo H2 y H3 | Todos los niveles | El título ocupa el nivel 1 † (motivo no registrado) |
| `Cmd/Ctrl+I` para la IA, cursiva con `Shift` | Otro atajo para la IA | Comentario en `use-article-editor.ts`: el atajo estaba reservado para el drawer de IA |
| Degradar enlaces inseguros a texto en vez de bloquear el guardado | Rechazar el artículo | El autor no pierde texto; el enlace peligroso simplemente no se activa † |
| Editor solo desde `md` ([ADR 0009](../adr/0009-tipos-de-post-y-likes.md)) | Detectar móvil en el servidor | El ancho de pantalla no se conoce en el servidor; es UX, no seguridad |

## Criterios de aceptación

- [ ] Abrir un artículo con tablas, imágenes o listas de tareas, escribir algo y guardar **no** las pierde.
- [ ] Un enlace `javascript:` escrito en markdown se muestra como texto plano y no como enlace.
- [ ] `Cmd/Ctrl+I` abre el chat de IA (no pone cursiva); `Cmd/Ctrl+Shift+I` sí pone cursiva.
- [ ] La barra refleja el formato activo (`aria-pressed`) y no pierde la selección al hacer click.
- [ ] En un ancho menor a `md` aparece "Editá artículos desde una computadora" y el editor no se monta.
- [ ] La vista previa muestra el mismo contenido que verá el lector, sin imágenes.

## Cómo verificarla a mano

1. `pnpm dev`, iniciá sesión y abrí `/editor/new` en una ventana ancha.
2. Escribí un título y un H2 con el menú "Estilo de bloque"; probá negrita, listas y un enlace.
3. Pegá `[hola](javascript:alert(1))` en el campo de enlace o como markdown: debe quedar como texto.
4. Alterná "Vista previa" y "Editar": el contenido debe coincidir.
5. Achicá la ventana por debajo de 768 px (`useIsDesktop`, `min-width: 768px`): debe aparecer el aviso.
6. `pnpm test`: mirá `link-safety.test.ts`. Tiptap **no** se prueba con tests unitarios a propósito (necesita navegador; lo cubre Playwright, ver [PRD-X.1](PRD-X.1-testing-e2e.md)).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Botón de imagen / subida (hoy el editor conserva imágenes existentes, pero `MarkdownContent` no las muestra) | A |
| Tests unitarios de `normalizeUrl` (hoy solo está probado `isSafeLinkHref`) | B |
| Probar en Playwright que tablas/imágenes sobreviven al round-trip (hoy no hay un e2e del editor de texto en sí) | M |

## Preguntas de autoevaluación

1. ¿Por qué se guarda markdown y no el JSON del editor? ¿Qué se gana y qué cuesta?
2. ¿Por qué hay extensiones registradas (tablas, imágenes) que no tienen botón?
3. Explicá qué ataque evita `isSafeLinkHref` y por qué hace falta quitar caracteres invisibles.
4. ¿Por qué el título no es parte de Tiptap?
5. ¿Qué diferencia hay entre el renderizado del editor y el de `MarkdownContent`?
6. ¿Qué pasa si abro `/editor/nuevo-id` desde el celular?
