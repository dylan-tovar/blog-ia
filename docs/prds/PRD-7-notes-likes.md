# PRD 7 — Tipos de post (notas y artículos) y me gusta

| Campo | Valor |
| :--- | :--- |
| Estado | Implementado. Enmienda el modelo de [PRD-2](PRD-2-posts.md) y acota el alcance de [PRD-5](PRD-5-ai-author.md) |
| Depende de | [PRD 0](PRD-0-design-system.md), [PRD 1](PRD-1-auth.md), [PRD 2](PRD-2-posts.md) |
| Migraciones | `0005_post_types_and_likes.sql`, `0006_allow_note_updates.sql` (y `0007` para los privilegios de columna) |
| ADRs relacionados | [0009](../adr/0009-tipos-de-post-y-likes.md), [0010](../adr/0010-editor-markdown.md), [0015](../adr/0015-notas-editables.md) |
| Código | `src/features/posts/` (actions de notas, `NoteDialog`, `NoteComposer`, `CreatePostMenu`, `PostCard`), `src/features/likes/` |

## Paquetes de trabajo

| Paquete | Qué cubre | Dificultad | Esfuerzo | Dueño sugerido |
| :--- | :--- | :--- | :--- | :--- |
| [PRD-7.1](PRD-7.1-post-types-db.md) | Tipos de post, respuestas y `likes` en la base de datos | A | M | D2 |
| [PRD-7.2](PRD-7.2-notes-ui.md) | Crear, responder, editar y borrar notas | M | M | D6 |
| [PRD-7.3](PRD-7.3-likes.md) | Me gusta: acción, botón y conteo | B | S | D7 |

> **Enmienda a PRDs anteriores.** A partir de aquí "post" se divide en dos tipos: **nota** y **artículo**. Las funciones de IA de PRD-5 aplican **solo a artículos** (sección "Alcance de la IA").

## Resumen

Hay dos tipos de post en una misma tabla: la **nota** (texto simple de hasta 500 caracteres, sin título ni tags, publicada al instante, editable y borrable por su autor, opcionalmente **dejada sobre otro post**) y el **artículo** ([PRD-2](PRD-2-posts.md)). Cualquier post publicado puede recibir **me gusta**. Las notas se escriben desde cualquier dispositivo; los artículos, solo desde pantallas `md` o mayores.

## Problema y objetivo

* Poder publicar algo corto sin pasar por un editor ni por revisión, tan rápido como mandar un mensaje.
* Poder responder a un post con una nota, sin construir un sistema de comentarios anidados.
* Que el feed distinga visualmente notas y artículos.
* Que cualquier post reciba me gusta de otros usuarios.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Notas independientes y notas dejadas sobre un post (un solo nivel) | Hilos anidados: no se puede responder a una respuesta |
| Editar y borrar las propias notas | Borrar o editar notas de otras personas |
| Me gusta en cualquier post publicado, con conteo | Actualización en tiempo real del conteo (websockets) |
| Renderizado diferenciado en el feed | Foto de portada en artículos (no hay espacio reservado en la tarjeta) |
| Editor de artículos solo desde `md` | Moderación de IA para notas |

## Cómo funciona

### Crear una nota

| Punto de entrada | Comportamiento |
| :--- | :--- |
| Botón "+" (barra inferior, con sesión) en móvil | Abre `NoteDialog` directo (pantalla completa, respeta el teclado en pantalla con `visualViewport`) |
| Botón "+" en escritorio y botón "Crear" | `CreatePostMenu`: opciones **Nota** ("Texto corto, hasta 500 caracteres") y **Artículo** ("Editor completo con markdown", enlaza a `/editor/new`) |
| Barra "¿Qué estás pensando?" (`NoteTriggerBar`) | En `/` y en la pestaña Activity/Posts del perfil propio: abre el mismo `NoteDialog` |
| Campo en `/post/[id]` (`NoteComposer`) | Deja una nota **sobre ese post** (`parentPostId`); sin sesión aparece "Iniciá sesión para dejar una nota." |

En móvil, la opción **Artículo** del menú aparece deshabilitada ("Disponible solo desde computadora").

```text
createNote(formData):                          (src/features/posts/actions.ts)
  requireUser
  validar con createNoteSchema: texto sin espacios sobrantes, 1..500 caracteres; parentPostId opcional (uuid)
  insertar en posts: type = 'note', status = 'published', published_at = ahora,
                     parent_post_id = parentPostId o null      (sin revisión de IA)
  revalidar "/", el perfil del autor y, si es respuesta, el post padre
```

El contador de caracteres aparece cuando quedan 50 o menos.

### Respuestas: notas sobre otro post

* Una nota puede colgar de un post **publicado** que **no sea a su vez una respuesta**. Lo hace cumplir la función `can_attach_note` (ver "Datos"), así que **no hay hilos anidados**.
* En `/post/[id]` de un artículo o de una nota independiente se lista, debajo, la sección "Notas (N)" con las respuestas en orden cronológico (hasta 100). En la página de una **respuesta** no se muestra esa sección ni el contador de notas.
* Una respuesta muestra "En respuesta a <título o autor del post original>" (en el feed y en su propia página). Si el padre se borra, la respuesta **no se borra**: `parent_post_id` pasa a `NULL` (`on delete set null`) y la nota queda como una nota independiente.
* Se puede dejar una nota sobre un post propio.

### Editar y borrar una nota

Desde el menú "más opciones" (`PostOptionsDrawer`) del autor:

| Acción | Cómo funciona |
| :--- | :--- |
| Editar nota | `EditNoteDialog` → `updateNote(postId, content)`: mismas reglas (1–500 caracteres, no vacía), solo si `author_id = yo` y `type = 'note'` |
| Eliminar nota | `deleteNote`. Pide **confirmación con un segundo toque** ("Tocá de nuevo para eliminar") antes de borrar. Solo notas propias |

**Las notas son editables** (migración `0006`, [ADR 0015](../adr/0015-notas-editables.md)). Esto cambia lo que decía el PRD original ("no hay edición de notas") y la migración `0005` ("las notas son inmutables"): esa regla se revirtió, pero **el motivo de producto no quedó registrado** ([ADR 0015](../adr/0015-notas-editables.md)). El tipo y el estado siguen protegidos: el cliente solo puede actualizar `title` y `content` (privilegios por columna, [ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md)) y los `CHECK` de la nota impiden ponerle título o cambiar su forma.

### Crear un artículo

Se hace desde "Crear → Artículo" o el "+" en escritorio, hacia `/editor/new`. La fila **no** se crea al pulsar: se crea en el primer autoguardado con contenido ([PRD-2](PRD-2-posts.md)). En pantallas estrechas, `/editor/*` muestra "Editá artículos desde una computadora" y no monta el editor. Es una decisión de **interfaz**, no de seguridad: RLS no puede saber el ancho de pantalla.

### Feed: renderizado diferenciado (`PostCard`)

| Tipo | Cómo se ve |
| :--- | :--- |
| Artículo | `ArticleCard`: recuadro con título ("Sin título" si falta) y extracto de hasta 3 líneas |
| Nota | `NoteItem`: texto simple en línea, con "En respuesta a…" si tiene padre |

Ambos llevan avatar, autor, fecha relativa, botón de seguir, menú de opciones, me gusta y el contador de notas (oculto en las respuestas).

### Me gusta (`src/features/likes/`)

```text
setLike(postId, liked):                        // recibe el ESTADO DESEADO, no un "toggle"
  validar { postId: uuid, liked: boolean }; requireUser
  liked = true  -> upsert en likes (user_id, post_id) con ignoreDuplicates
  liked = false -> delete de (user_id, post_id)
  revalidar "/" y /post/<id>
```

* **Idempotente:** un doble click o un reintento no invierten el resultado.
* `LikeButton` es **optimista** y reconcilia con la respuesta del servidor. Un visitante sin sesión ve un enlace que lleva a `/login`.
* El conteo sale de `likes(count)` al leer el post (**no** hay una columna `likes_count` cacheada).
* Solo se puede dar me gusta a **posts publicados** (RLS).
* El perfil público lista los posts a los que su dueño dio me gusta (pestaña Likes, [PRD-3](PRD-3-feed-follows.md)).

## Datos

### Cambios en `posts` (migración `0005`)

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `type` | `text`, `NOT NULL`, default `'article'` | `'note'` o `'article'` (`CHECK posts_type_check`) |
| `parent_post_id` | `uuid`, nullable | → `posts.id`, `on delete set null`. Índice parcial `posts_parent_post_id_idx` |

**Invariantes que vive en la base** (`CHECK`), no solo en las Server Actions:

| Restricción | Regla |
| :--- | :--- |
| `posts_note_shape_check` | Una nota es siempre `published`, con `published_at` y **sin título** |
| `posts_note_length_check` | Una nota tiene de 1 a 500 caracteres (`NOT VALID`: las notas convertidas al migrar pueden excederlo; aplica a toda nota nueva) |
| `posts_article_no_parent_check` | Solo una nota puede tener `parent_post_id` |

`can_attach_note(uuid)` (`SECURITY DEFINER`, `search_path` vacío, ejecutable por `authenticated`) valida que el padre esté publicado y no sea él mismo una respuesta. Es una función aparte porque una política de `posts` que consulta `posts` falla con el error `42P17` (recursión de RLS).

### Tabla `likes`

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | → `profiles.id`, quien da el me gusta |
| `post_id` | `uuid` | → `posts.id` (nota o artículo) |
| `created_at` | `timestamptz` | |

`UNIQUE (user_id, post_id)`; índice `likes_post_id_idx`.

### RLS (estado vigente)

| Tabla | Acción | Regla |
| :--- | :--- | :--- |
| `posts` | INSERT | El dueño; una nota o un artículo `draft`; `parent_post_id` solo si `can_attach_note` |
| `posts` | UPDATE | El dueño (migración `0006`); las columnas escribibles están limitadas a `title` y `content` (`0007`) |
| `posts` | DELETE | El dueño |
| `post_tags` | INSERT | Solo sobre artículos: las notas no llevan tags |
| `likes` | SELECT | Público |
| `likes` | INSERT | El propio usuario, **solo sobre posts publicados** (la FK ignora RLS y permitiría likear borradores) |
| `likes` | DELETE | Solo el propio usuario |

## Alcance de la IA: solo artículos

La IA aplica solo a artículos, por construcción y por filtros explícitos, según la función:

* **Chat del editor** ([PRD-8](PRD-8-ai-chat.md)): no consulta la base ni filtra por tipo. Solo existe dentro del editor, que solo abre artículos (`getOwnPost` filtra por `type = 'article'`); las notas no tienen editor.
* **Moderación y auto-tagging** ([PRD-5](PRD-5-ai-author.md)): `publishPost` opera sobre artículos.
* **Resumen** ([PRD-6](PRD-6-ai-reader.md)): solo artículos publicados.
* **Recomendaciones** ([PRD-4](PRD-4-recommendations.md)): filtran `type = 'article'` en la consulta (`recommendations/queries.ts`).

| Función | Por qué no aplica a notas |
| :--- | :--- |
| Chat, estructura, títulos, tono, análisis | Asumen un contenido extenso con estructura; una nota de una o dos líneas no tiene qué estructurar ni qué tono ajustar |
| Moderación y auto-tagging | Las notas no tienen tags (consta en la base); moderarlas agregaría latencia a algo pensado para ser instantáneo † |
| Recomendaciones | Se puntúan por tags, y las notas no los tienen |

Si apareciera abuso en notas, la vía que sugiere la interfaz es un botón de **reportar contenido** (†: no hay una decisión registrada al respecto). Hoy ese botón **existe en el menú pero no hace nada** (ver limitaciones).

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Una sola tabla `posts` con `type`** ([ADR 0009](../adr/0009-tipos-de-post-y-likes.md)) | Tablas `notes` y `articles` separadas; una tabla polimórfica | Notas y artículos comparten autor, feed y likes: dos tablas obligarían a duplicar esa lógica (consta en [ADR 0009](../adr/0009-tipos-de-post-y-likes.md)). Costo: algunas columnas quedan en `NULL` según el tipo (`title`) |
| **Invariantes en la base (`CHECK` + RLS)** | Validar solo en las Server Actions | Una llamada directa a la API de Supabase con la anon key no puede saltarse las reglas ([ADR 0003](../adr/0003-seguridad-rls-y-proxy-minimo.md)) |
| **`can_attach_note` como función `SECURITY DEFINER`** | Una política que consulte `posts` desde `posts` | La recursión de RLS (`42P17`) lo impide; la función sale de RLS de forma controlada |
| **Sin hilos anidados** | Comentarios en árbol | Evita el modelo, la interfaz y la moderación de un sistema de hilos †. El tope de un nivel lo hace cumplir `can_attach_note` |
| **Notas editables** ([ADR 0015](../adr/0015-notas-editables.md)) | Notas inmutables (borrar y reescribir) | **Motivo de producto no registrado**; el efecto es poder corregir una nota sin borrarla. Costo: el contenido de una nota ya publicada puede cambiar sin registro de versiones |
| **`setLike` recibe el estado deseado** | `toggleLike` | Un doble click o un reintento no invierten el resultado (consta en `setLike` y su test de esquema) |
| **Sin `likes_count` cacheado** | Contador en `posts` con triggers | A este volumen contar filas es trivial †. Si el proyecto creciera, sería la primera optimización, no la primera decisión |
| **Notas sin moderación de IA** | Moderar todo | Publicar una nota debe sentirse instantáneo † y las notas no tienen tags que sugerir (esto último consta en el `CHECK` y en `post_tags`) |
| **Editor de artículos solo en `md`+** ([ADR 0009](../adr/0009-tipos-de-post-y-likes.md), [ADR 0010](../adr/0010-editor-markdown.md)) | Detectar móvil por user agent en el servidor | El ancho de pantalla no se conoce en el servidor; la media query es la fuente correcta. Es UX, no seguridad |
| **Diálogo de pantalla completa en móvil para escribir notas** | Campo en línea en el feed | El teclado en pantalla y una nota larga funcionan mejor en un diálogo dedicado †; el compositor en línea (`NoteComposer`) queda solo para responder desde `/post/[id]` |

## Criterios de aceptación

- [x] Una nota se puede crear desde móvil y aparece publicada de inmediato, sin revisión.
- [x] Una nota no admite título, tags, texto vacío ni más de 500 caracteres (validado también en la base).
- [x] El autor puede editar y borrar sus propias notas (el borrado pide un segundo toque) y no las de otros.
- [x] Un artículo no se edita desde una pantalla móvil.
- [x] El feed muestra los artículos como recuadros y las notas como texto simple.
- [x] Una nota dejada sobre un post aparece listada debajo de ese post; no se puede responder a una respuesta.
- [x] Dar y quitar me gusta refleja el cambio al instante y no permite duplicados ni likes a borradores.
- [x] Si se borra un post con respuestas, las respuestas no se borran.

## Limitaciones conocidas y deuda

| Tema | Detalle |
| :--- | :--- |
| **Menú "más opciones" con opciones sin efecto** | Reales: editar nota, editar artículo, copiar enlace, eliminar nota. **Sin efecto (solo cierran el menú):** Guardar, Guardar como imagen, Seguir, "Analizar texto con IA", Ocultar publicación, Silenciar, Bloquear y **Reportar**. No existen marcadores, silenciar, bloquear ni reportes. Ver [PRD-9](PRD-9-explore-activity.md) |
| Sin portada | No hay espacio reservado para una foto en la tarjeta del artículo |
| No se puede borrar un artículo | `deleteNote` solo actúa sobre notas |
| Sin historial de ediciones de notas | No hay versiones ni marca de "editado" |
| Notas convertidas | El `CHECK` de longitud es `NOT VALID`: las filas anteriores a `0005` pueden superar 500 caracteres |
| Sin conteo de "me gusta" en tiempo real | Se recalcula al cargar o refrescar |
| `updateNote` repite el límite | El 500 está fijo en la action además de en `NOTE_MAX_LENGTH`; conviene unificarlo |
| e2e | No hay pruebas e2e de notas, respuestas ni me gusta |

## Pruebas

| Tipo | Archivo | Cubre |
| :--- | :--- | :--- |
| Unitarias | `src/features/posts/schemas.test.ts` (`createNoteSchema`), `src/features/likes/schemas.test.ts` (`setLikeSchema`), `src/features/posts/utils.test.ts` (extractos, `replyTarget`) | Validación de notas y me gusta, texto de la referencia de respuesta |
| e2e | — | Notas y me gusta no tienen cobertura e2e |
