# PRD-2.4 — Diálogo de publicar, tags y barra superior del editor

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-2 — Posts](PRD-2-posts.md) |
| Dificultad / Esfuerzo | M (media) / M (2-3 días) |
| Dueño sugerido / Mentor | D3 / D1 |
| Depende de | [PRD-2.3](PRD-2.3-autosave-drafts.md) (`persist` asegura que el post exista), [PRD-5.3](PRD-5.3-publish-moderation.md) (lo que hace `publishPost` por dentro) |
| Código | `src/features/posts/components/editor/PublishDialog.tsx`, `EditorTopBar.tsx`, `src/features/posts/components/PostStatusBadge.tsx`, `src/features/posts/actions.ts` (`addTag`, `removeTag`, `attachTag`, lado cliente de `publishPost`), `src/features/posts/schemas.ts` (`tagNameSchema`) |
| ADRs | [0011](../adr/0011-ia-con-gemini.md), [0012](../adr/0012-integridad-de-escritura-de-posts.md) |

## Resumen

El paso final del autor: el botón **"Continuar"** de la barra superior abre un diálogo donde se administran los **tags** y se pulsa **"Publicar"**. Publicar no es instantáneo: el servidor revisa el texto con IA (moderación) y el diálogo tiene que mostrar bien cada posible resultado: publicado, rechazado, "estamos ocupados" o publicado sin tags automáticos. Este paquete es **la interfaz** de ese flujo; la lógica de servidor está en [PRD-5.3](PRD-5.3-publish-moderation.md).

## Qué necesitás entender antes

- [ ] Componentes cliente y **props** que son funciones (callbacks): `onPublished`, `onRejected`...
- [ ] `useState` y `useTransition` (marca una actualización como "en curso": `isPending`).
- [ ] Qué es un **tipo unión** en TypeScript (`PublishPostResult` tiene 4 formas).
- [ ] El ciclo de estados de un artículo: `draft` → `pending_review` → `published` / `rejected` ([PRD-2](PRD-2-posts.md)).
- [ ] Conceptual: qué es la moderación con IA y por qué puede "fallar abierto" o "cerrado" ([PRD-5.3](PRD-5.3-publish-moderation.md)); no hace falta entender su código.
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `EditorTopBar`: volver, estado, estado de guardado, contador, botones IA / Vista previa / Continuar | El chat de IA en sí: [PRD-8.2](PRD-8.2-chat-drawer-ui.md) |
| `PublishDialog`: tags, publicar, los 4 resultados, cuenta regresiva de "ocupado" | La reserva, la moderación y el auto-etiquetado en el servidor: [PRD-5.3](PRD-5.3-publish-moderation.md) |
| `addTag` / `removeTag` / `attachTag` y sus reglas | Guardar el texto: [PRD-2.3](PRD-2.3-autosave-drafts.md) |
| `PostStatusBadge` (Borrador, En revisión, Publicado, Rechazado) | Mostrar tags a los lectores (no se muestran: [ADR 0020](../adr/0020-tags-como-metadato-interno.md)) |

## Cómo funciona

Orden de lectura: `PostStatusBadge.tsx` → `EditorTopBar.tsx` → `PublishDialog.tsx` → `addTag`/`removeTag`/`attachTag` en `actions.ts`.

### 1. La barra superior

`EditorTopBar` recibe todo por props (no tiene lógica de negocio). Muestra: flecha "Volver a mis posts" (`/posts`), el `PostStatusBadge`, el texto de guardado, el contador de caracteres (solo desde el 90 % del límite) y a la derecha: **IA** (abre el chat), **Vista previa/Editar** y **Continuar**. El texto del último botón depende de `canPublish`: **"Continuar"** si el artículo está en `draft`, `rejected` o `pending_review`; **"Tags"** si ya está publicado (en ese caso el diálogo solo sirve para editar tags).

### 2. Tags

`attachTag(supabase, postId, rawName)` (privada en `actions.ts`):

1. Normaliza con `tagNameSchema`: `trim`, minúsculas, entre 1 y 50 caracteres.
2. Cuenta los tags del post: si ya hay `MAX_TAGS_PER_POST` (8) devuelve `limit`.
3. Crea el tag si no existe (`upsert` con `ignoreDuplicates`: `ON CONFLICT DO NOTHING`, porque `tags` no permite `UPDATE`, ver [PRD-2.1](PRD-2.1-posts-data-rls.md)).
4. Lo lee y crea la relación en `post_tags` (también con `ignoreDuplicates`).

`addTag` y `removeTag` son las Server Actions que llama el diálogo; devuelven `{ ok, tag?, error? }`. El campo de texto sugiere los tags existentes con un `<datalist>` (`allTagNames`, cargados por la página del editor).

### 3. Publicar: los cuatro resultados

`handlePublish` valida que haya contenido, llama a `ensurePostId()` (que es `persist` de [PRD-2.3](PRD-2.3-autosave-drafts.md): garantiza que el borrador exista y esté guardado) y luego a `publishPost(postId)`, que devuelve:

| Resultado | Qué hace el diálogo |
| :--- | :--- |
| `{ ok: false, error }` | Muestra el mensaje en rojo (`role="alert"`) |
| `status: "rejected", reason` | Llama a `onRejected(reason)`: `PostEditor` marca el artículo como `rejected`, muestra "Rechazado: <motivo>" y **cierra** el diálogo |
| `status: "busy", retryAfter` | Muestra `BusyNotice`: cuenta regresiva (`useCountdown`) y botón "Reintentar" deshabilitado hasta que termine. **El artículo no se publicó** |
| `status: "published", aiTags, aiSkippedReason?` | Muestra "Publicado" (con los tags sugeridos si los hay). Si la IA no estuvo disponible (`skipped`) avisa "Publicado sin tags automáticos" y ofrece "Seguir editando" y "Ver publicación". Si no, redirige solo a `/post/<id>` a los 1500 ms (`REDIRECT_DELAY_MS`) |

Mientras hay una petición en vuelo (`isPending`) el diálogo **no se puede cerrar** y el botón dice "Revisando contenido…". Una vez que hay resultado, siempre se puede cerrar.

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| Los tags y "Publicar" viven dentro de un diálogo abierto por "Continuar", no en la barra | El editor queda limpio y los tags se piden justo antes de publicar † (motivo no registrado) |
| `busy` **no** publica y deja reintentar | Si un límite de peticiones publicara igual, cualquiera podría saltarse la moderación agotándolo a propósito ([PRD-5.3](PRD-5.3-publish-moderation.md), [ADR 0011](../adr/0011-ia-con-gemini.md)) |
| Si falla el proveedor de IA se publica igual, sin tags automáticos | La disponibilidad del blog no depende de un servicio externo ([ADR 0011](../adr/0011-ia-con-gemini.md)) |
| `ignoreDuplicates` al crear tags | `tags` no tiene política de `UPDATE`; un `upsert` común intentaría actualizar y RLS lo rechazaría |
| Tope de 8 tags por artículo | Evita saturar el catálogo †; el porqué del número no quedó registrado |

## Criterios de aceptación

- [ ] "Continuar" abre el diálogo; en un artículo ya publicado el botón se llama "Tags" y el diálogo no tiene "Publicar".
- [ ] Agregar el mismo tag dos veces no lo duplica; el noveno tag muestra "Llegaste al máximo de 8 tags por artículo".
- [ ] Publicar un artículo vacío muestra "El artículo no puede estar vacío para publicarlo."
- [ ] Un artículo rechazado muestra "Rechazado: <motivo>" en el editor y se puede editar y reintentar.
- [ ] Con el límite de peticiones alcanzado aparece la cuenta regresiva y **no** se publica.
- [ ] Publicado con éxito: mensaje "Publicado" y redirección a `/post/<id>`.

## Cómo verificarla a mano

1. `pnpm dev`, creá un borrador con texto en `/editor/new`.
2. Pulsá **Continuar**, agregá tres tags (uno repetido) y quitá uno.
3. Pulsá **Publicar** (necesita `GEMINI_API_KEY`; sin ella el artículo se publica sin tags automáticos): observá "Revisando contenido…" y el resultado.
4. Volvé a abrir el artículo desde `/posts`: el botón debe decir "Tags".
5. Para ver `busy`: publicá varias veces seguidas hasta pasar el límite de peticiones por minuto ([PRD-5.2](PRD-5.2-rate-limit.md)).
6. Los e2e de este flujo (`e2e/posts.spec.ts`) están desactualizados (buscan un botón "Publicar" fuera del diálogo): ver [PRD-X.1](PRD-X.1-testing-e2e.md).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| `MAX_TAGS_PER_POST` vive en `features/ai/constants` pero es una regla de posts: moverla a `features/posts/constants.ts` | B |
| Los errores de tags son genéricos ("No pudimos agregar el tag."): distinguir tag inválido, límite y fallo | B |
| Mostrar en el diálogo el motivo de rechazo anterior sin cerrarlo (hoy se cierra y el motivo queda en el editor) | M |
| Reescribir los e2e de publicar para el diálogo "Continuar" | M |

## Preguntas de autoevaluación

1. ¿Por qué el botón dice "Tags" en un artículo ya publicado?
2. ¿Qué diferencia hay entre `rejected` y `busy`? ¿Por qué `busy` no publica?
3. ¿Qué hace `ensurePostId` y por qué se llama antes de agregar un tag o publicar?
4. ¿Por qué `attachTag` usa `ignoreDuplicates` en lugar de un `upsert` normal?
5. ¿Qué ve el autor si Gemini no responde? ¿Y si se alcanzó el límite de peticiones?
6. ¿Por qué el diálogo no se puede cerrar mientras `isPending`?
