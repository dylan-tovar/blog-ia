# PRD-7.2 — Notas: crear, responder, editar y borrar

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-7 — Notas y me gusta](PRD-7-notes-likes.md) |
| Dificultad / Esfuerzo | M (media) / M (2 a 3 días) |
| Dueño sugerido / Mentor | D6 / D3 |
| Depende de | [PRD-7.1](PRD-7.1-post-types-db.md) (reglas de la base), [PRD-0.2](PRD-0.2-ui-primitives.md) (`Dialog`, `Textarea`, `Button`), [PRD-0.3](PRD-0.3-app-shell.md) (el botón "+" vive en el shell) |
| Alimenta a | [PRD-9.3](PRD-9.3-post-options-drawer.md) (el menú "más opciones" abre la edición y borra la nota) |
| Código | `src/features/posts/components/{NoteDialog,NoteComposer,NoteTriggerBar,EditNoteDialog,CreatePostMenu,NewPostButton,use-note-form}.ts(x)`, `createNote` / `updateNote` / `deleteNote` en `src/features/posts/actions.ts`, `createNoteSchema` en `src/features/posts/schemas.ts`, `src/hooks/use-is-desktop.ts`, `use-visual-viewport-style.ts` |
| ADRs | [0009](../adr/0009-tipos-de-post-y-likes.md), [0015](../adr/0015-notas-editables.md) |

## Resumen

La **nota** es un texto corto (hasta 500 caracteres) que se publica al instante, sin título ni moderación. Este paquete cubre las **cuatro puertas de entrada** para escribirla (botón "+", menú "Crear", barra "¿Qué estás pensando?" y campo bajo un post), el formulario común, la **edición** de una nota y su **borrado**. Es el paquete que mejor enseña cómo se conecta un formulario con una Server Action.

## Qué necesitás entender antes

- [ ] Componentes de cliente y estado en React (`useState`).
- [ ] `useActionState`: conecta un `<form action={...}>` con una Server Action y te devuelve su resultado.
- [ ] Qué es una **Server Action** y por qué valida con Zod aunque el formulario ya limite la longitud.
- [ ] Qué es un **diálogo modal** y cómo se cierra al terminar.
- [ ] Media queries (`md` = 768 px) y por qué `useIsDesktop` devuelve `null` en el servidor.
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Los diálogos y campos para crear y editar notas | Las reglas de la base (`CHECK`, `can_attach_note`): [PRD-7.1](PRD-7.1-post-types-db.md) |
| Las Server Actions `createNote`, `updateNote`, `deleteNote` y su validación | El menú "más opciones" que dispara editar/borrar: [PRD-9.3](PRD-9.3-post-options-drawer.md) |
| El menú "Crear" (Nota o Artículo) y el botón "+" | El editor de artículos: [PRD-2.2](PRD-2.2-editor-tiptap.md) |
| El contador de caracteres | Cómo se dibuja una nota en el feed (`NoteItem`, `PostCard`): [PRD-3.2](PRD-3.2-feed-list.md) |

## Cómo funciona

Orden de lectura sugerido: `schemas.ts` (`createNoteSchema`) → `createNote` en `actions.ts` → `use-note-form.ts` → `NoteDialog.tsx` → `NoteComposer.tsx` → `CreatePostMenu.tsx` / `NewPostButton.tsx` → `EditNoteDialog.tsx` → `updateNote` y `deleteNote`.

### 1. Las puertas de entrada

| Dónde | Componente | Qué hace |
| :--- | :--- | :--- |
| Botón "+" flotante, **móvil** (menos de 768 px) | `NewPostButton` | Abre `NoteDialog` directo |
| Botón "+" flotante, **escritorio** | `NewPostButton` → `CreatePostMenu` | Menú con **Nota** ("Texto corto, hasta 500 caracteres") y **Artículo** (enlace a `/editor/new`) |
| Barra "¿Qué estás pensando?" | `NoteTriggerBar` | Abre `NoteDialog`. Se usa en `/` y en el perfil |
| Campo bajo un post en `/post/[id]` | `NoteComposer` | Escribe una nota **sobre ese post** (`parentPostId` en un campo oculto). Sin sesión se ve "Iniciá sesión para dejar una nota." |

En móvil la opción **Artículo** del menú aparece deshabilitada ("Disponible solo desde computadora"): es una decisión de interfaz, no de seguridad ([ADR 0009](../adr/0009-tipos-de-post-y-likes.md)).

### 2. El formulario compartido (`use-note-form.ts`)

```text
useNoteForm(onPublished?):
  estado: content
  useActionState(createNote): al terminar con ok -> limpiar el texto y llamar onPublished()
  remaining   = 500 - content.length
  showCounter = remaining <= 50          // el contador solo aparece al final
  canSubmit   = hay texto no vacío y no está enviando
```

Lo usan `NoteDialog` y `NoteComposer`; así el comportamiento no se duplica. `NoteDialog` monta el formulario **dentro** de `DialogContent`, que se desmonta al cerrar: el estado se reinicia solo cada vez. En móvil el diálogo ocupa toda la pantalla y sigue al teclado en pantalla con `useVisualViewportStyle`.

### 3. Server Actions (`actions.ts`)

| Acción | Qué valida | Qué hace |
| :--- | :--- | :--- |
| `createNote` | `createNoteSchema`: texto recortado, 1 a 500 caracteres, `parentPostId` y `replyToPostId` opcionales (uuid) | Inserta `type: 'note'`, `status: 'published'`, `published_at: ahora`, `parent_post_id`, `reply_to_post_id`; **sin revisión de IA**. Revalida `/`, el perfil del autor y, si es respuesta, el post padre |
| `updateNote` | id válido, texto no vacío, hasta 500 caracteres | `UPDATE content` filtrando `author_id = yo` y `type = 'note'`. Revalida las mismas rutas |
| `deleteNote` | id válido | `DELETE` filtrando `author_id = yo` y `type = 'note'`; devuelve el `parent_post_id` para revalidar el padre |

Las tres usan `requireUser` (sin sesión, redirige a `/login`) y **el filtro por autor y tipo** además de RLS: si alguien manda el id de un artículo o de una nota ajena, no actualiza ni borra nada.

### 4. Editar y borrar

- **Editar:** `EditNoteDialog` (mismo diseño que `NoteDialog`) llama a `updateNote`, cierra, hace `router.refresh()` y avisa con `onEdited`. Las notas son editables desde la migración `0006` ([ADR 0015](../adr/0015-notas-editables.md)); el motivo de producto no quedó registrado †.
- **Borrar:** el botón vive en `PostOptionsDrawer` ([PRD-9.3](PRD-9.3-post-options-drawer.md)) y pide un **segundo toque** ("Tocá de nuevo para eliminar") antes de llamar a `deleteNote`.
- **Responder a un post:** una nota puede colgar de un post publicado; `parent_post_id` siempre apunta a la raíz del hilo, lo hace cumplir la base ([PRD-7.1](PRD-7.1-post-types-db.md)).
- **Responder a una respuesta:** `PostCard` (feed, perfil de autor y lista de notas de un post) muestra un botón "Responder" en toda nota, no solo en artículos. Al tocarlo despliega un `NoteComposer` inline con `parentPostId` = raíz del hilo (`post.parent.id`) y `replyToPostId` = la nota respondida; se colapsa solo al publicar (`onPublished`). `NoteItem` prioriza `replyTo` sobre `parent` para el texto "En respuesta a X", así una respuesta de 2º nivel muestra el autor inmediato en vez de la raíz. Ver [ADR 0029](../adr/0029-respuestas-a-respuestas.md).

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Diálogo de pantalla completa en móvil** | Un campo en línea en el feed | El teclado en pantalla y una nota larga funcionan mejor en un diálogo dedicado †. El campo en línea (`NoteComposer`) queda solo para responder desde `/post/[id]` |
| **Un solo formulario (`useNoteForm`) para diálogo y campo** | Duplicar la lógica | Un solo lugar para el contador y el envío |
| **Notas sin moderación de IA** | Moderar todo | Publicar debe sentirse instantáneo † y las notas no tienen tags que sugerir |
| **Filtrar por autor y tipo además de RLS** (defensa en profundidad) | Confiar solo en las políticas | Una acción mal usada no toca posts ajenos |
| **Borrado con segundo toque** | Diálogo de confirmación | Confirmación sin ventana extra; el estado se reinicia al cerrar el menú |
| **Contador solo en los últimos 50 caracteres** (`NOTE_COUNTER_THRESHOLD`) † | Contador siempre visible | Menos ruido visual (el motivo no quedó registrado) |

## Criterios de aceptación

- [ ] Una nota se publica de inmediato desde móvil y desde escritorio.
- [ ] No se puede enviar una nota vacía ni con más de 500 caracteres.
- [ ] El contador aparece cuando quedan 50 caracteres o menos.
- [ ] En móvil, "Artículo" aparece deshabilitado en el menú y el "+" abre la nota directo.
- [ ] Una nota dejada desde `/post/[id]` aparece listada bajo ese post.
- [ ] El autor puede editar su nota; nadie más puede.
- [ ] Borrar exige un segundo toque y solo borra notas propias.
- [ ] Sin sesión, el campo bajo un post invita a iniciar sesión.

## Cómo verificarla a mano

1. `pnpm test`: `schemas.test.ts` cubre `createNoteSchema`.
2. Ancho de ventana menor a 768 px: pulsá "+", escribí una nota, publicá y volvé a `/`: debe aparecer arriba.
3. Ancho mayor: el mismo "+" abre el menú Nota / Artículo.
4. Abrí un artículo y dejá una nota en el campo inferior: debe aparecer en "Notas (N)".
5. En tu nota, abrí "más opciones" → Editar: cambiá el texto y guardá. Luego Eliminar (dos toques).
6. Intentá escribir 501 caracteres: el campo lo impide (`maxLength`).

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| `updateNote` repite el límite 500 fijo en lugar de usar `NOTE_MAX_LENGTH` (y no reutiliza el mensaje de `createNoteSchema`): unificar | B |
| `EditNoteDialog` duplica casi todo el diseño de `NoteDialog`: extraer un diálogo base | M |
| No hay pruebas e2e de notas, respuestas ni me gusta: escribir una prueba de crear, editar y borrar ([PRD-X.1](PRD-X.1-testing-e2e.md)) | M |
| No hay marca de "editada" ni historial de ediciones | M |
| El contador usa `text-amber-400` fijo: pasarlo a un token del tema ([PRD-0.1](PRD-0.1-theme-tokens.md)) | B |

## Preguntas de autoevaluación

1. ¿Por qué `createNote` valida con Zod si el `<textarea>` ya tiene `maxLength`?
2. ¿Qué hace `useActionState` y qué devuelve?
3. ¿Por qué `updateNote` y `deleteNote` filtran `author_id` y `type` si RLS ya lo controla?
4. ¿Cómo sabe la nota que es una respuesta? ¿Qué diferencia hay entre `parent_post_id` y `reply_to_post_id`?
5. ¿Por qué `useIsDesktop` devuelve `null` en el servidor y qué evita eso?
6. ¿Por qué en móvil el "+" abre la nota directo pero en escritorio abre un menú?
