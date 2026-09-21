# PRD 3 — Feed, seguimiento e historial de lectura

| Campo | Valor |
| :--- | :--- |
| Estado | Implementado con limitaciones (la pestaña "Subscriptions" del perfil está vacía; no hay feed de "solo a quienes sigo") |
| Depende de | [PRD 0](PRD-0-design-system.md), [PRD 1](PRD-1-auth.md), [PRD 2](PRD-2-posts.md) |
| Migraciones | `0003_feed.sql` |
| ADRs relacionados | [0003](../adr/0003-seguridad-rls-y-proxy-minimo.md), [0004](../adr/0004-recomendaciones-scoring-determinista.md), [0009](../adr/0009-tipos-de-post-y-likes.md) |
| Código | `src/app/(public)/page.tsx`, `src/app/(public)/author/[id]/`, `src/features/posts/queries.ts`, `src/features/subscriptions/`, `src/features/profile/components/AuthorProfileView.tsx` |

## Paquetes de trabajo

Este PRD se reparte en tres paquetes que una persona puede asumir por separado (ver [reparto de tareas](../team/reparto-de-tareas.md)).

| ID | Paquete | Dificultad | Esfuerzo |
| :--- | :--- | :--- | :--- |
| [3.1](PRD-3.1-follow-system.md) | Sistema de seguimiento | M | M |
| [3.2](PRD-3.2-feed-list.md) | Feed de la portada y "Cargar más" | M | M |
| [3.3](PRD-3.3-author-profile.md) | Perfil público de autor | B | S |

## Resumen

El **feed** vive en `/` (con o sin sesión) y muestra los posts publicados —notas y artículos mezclados— del más reciente al más antiguo, de 20 en 20. Un usuario puede **seguir** a otros autores, y cada lectura de un artículo queda registrada en `reading_history`, que es la materia prima de las recomendaciones ([PRD-4](PRD-4-recommendations.md)). El **perfil público** de un autor (`/author/[id]`) reúne sus publicaciones, respuestas y me gusta.

> **Importante:** seguir a alguien **no cambia el feed**. El feed es global y cronológico; el seguimiento hoy solo alimenta el botón "Seguir"/"Siguiendo" y el contador de seguidores.

## Problema y objetivo

* Seguir y dejar de seguir a un autor.
* Un feed de posts publicados, cronológico, paginado.
* El feed puede filtrarse por tag.
* Registrar lo que cada usuario lee, sin bloquear nunca la lectura.
* Ver el perfil público de un autor con sus publicaciones.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Feed global en `/`, paginación con "Cargar más" | Feed "solo de a quienes sigo" (decisión original: fuera del mínimo, y se mantiene fuera) |
| Filtro por tag por URL (`/?tag=x`) | Interfaz de filtros en `/` (la fila de tags está en `/explore`, [PRD-9](PRD-9-explore-activity.md)) |
| Seguir / dejar de seguir, contador de seguidores | Notificaciones de nuevas publicaciones; lista navegable de seguidores/seguidos |
| `reading_history` como registro de mejor esfuerzo | Ranking por afinidad ([PRD-4](PRD-4-recommendations.md)) |
| Perfil público de autor con pestañas | Búsqueda de texto |

## Cómo funciona

### Feed (`/`)

`getFeedPage({ tag, offset })` (`src/features/posts/queries.ts`):

1. Consulta `posts` con `status = 'published'` (explícito: RLS también deja ver los borradores propios). Devuelve notas y artículos.
2. Ordena por `published_at` descendente y luego por `id` (desempate estable).
3. Trae 21 filas para saber si hay más (`hasMore`) y devuelve 20 (`FEED_PAGE_SIZE`).
4. Si hay `?tag=x`, filtra con un `INNER JOIN` sobre `post_tags`/`tags`. **El tag solo se usa para filtrar: no se selecciona para mostrarlo.**
5. Enriquece cada post en paralelo: si el visitante sigue al autor, cantidad de me gusta, si el visitante ya dio me gusta, la referencia al post padre (si es una respuesta) y el número de notas.

La página aplica el filtro de la URL con `tagNameSchema` (una etiqueta inválida se ignora). Los usuarios con sesión ven arriba la barra "¿Qué estás pensando?" y el menú "Crear" ([PRD-7](PRD-7-notes-likes.md)), y la sección "Recomendados para ti" ([PRD-4](PRD-4-recommendations.md)) cuando no hay filtro de tag. "Cargar más" (`FeedList` + la action `loadMoreFeed`) pide la página siguiente por `offset`.

### Seguir / dejar de seguir (`src/features/subscriptions/actions.ts`)

```text
followAuthor(authorId):
  validar uuid; requireUser (sin sesión -> /login)
  si authorId == usuario actual -> { ok: false }        (autoseguimiento bloqueado)
  upsert en subscriptions (follower_id, author_id) con ignoreDuplicates
unfollowAuthor(authorId):
  delete de la fila (follower_id = yo, author_id = authorId)
```

* El `upsert` con `ignoreDuplicates` hace idempotente el doble click.
* **El autoseguimiento se bloquea dos veces:** en la acción y con un `CHECK (follower_id <> author_id)` en la tabla.
* `FollowButton` es **optimista** (`useOptimistic`): la UI cambia al instante. Tiene dos variantes: botón ("Seguir" / "Dejar de seguir") en el perfil, y texto ("Seguir" / "Siguiendo") en las tarjetas del feed. Un visitante sin sesión ve un enlace "Seguir" que lleva a `/login`.
* Queries: `isFollowing`, `getFollowedAuthorIds` (para pintar el botón en una página de posts), `getFollowerCount`.

### Registro de lectura (`recordRead` + `ReadTracker`)

```text
al abrir /post/[id]:
  si hay sesión Y el post es un artículo (no una nota):
    ReadTracker -> recordRead(postId) -> upsert en reading_history (user_id, post_id, read_at = ahora)
```

* **Solo se registran lecturas de artículos** hechas por usuarios con sesión. Las notas no se registran.
* Es de **mejor esfuerzo**: cualquier fallo se ignora (`try/catch` devuelve `{ ok: false }`) y nunca afecta a la lectura.
* `upsert` sobre `(user_id, post_id)`: releer actualiza `read_at`, no duplica la fila.

### Perfil público (`/author/[id]`)

Carga, en paralelo: el perfil (404 si el id es inválido o no existe), los posts publicados del autor (hasta 50), los posts que el autor marcó con me gusta (hasta 50, solo publicados), el número de seguidores y si el visitante lo sigue.

`AuthorProfileView` muestra el nombre, `@username`, el contador de seguidores y avatar con iniciales. Debajo, según sea el perfil propio o ajeno:

| Perfil | Acciones |
| :--- | :--- |
| Propio | Menú "Crear", enlace "Edit profile" (→ `/settings`), menú de opciones (copiar enlace, compartir) y la barra de nota en las pestañas Activity y Posts |
| Ajeno | `FollowButton` (sin botón en el perfil propio) |

Pestañas (estado de cliente, sin cambiar la URL):

| Pestaña | Contenido |
| :--- | :--- |
| Activity | Todas las publicaciones del autor (artículos, notas y respuestas) |
| Posts | Artículos y notas que **no** son respuestas |
| Replies | Solo notas que son respuestas a otro post |
| Likes | Posts publicados a los que el autor dio me gusta |
| Subscriptions | **Siempre vacía**: no se carga ningún dato. Muestra "No subscriptions yet." |

El contador dice "See subscribers" (con 0) o "N subscriber(s)". **No es un enlace**: no hay lista de seguidores.

## Datos

### Tabla `subscriptions`

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `uuid` | PK |
| `follower_id` | `uuid` | → `profiles.id` (quien sigue), `on delete cascade` |
| `author_id` | `uuid` | → `profiles.id` (a quien se sigue), `on delete cascade` |
| `created_at` | `timestamptz` | |

Restricciones: `UNIQUE (follower_id, author_id)` y `CHECK (follower_id <> author_id)`. Índice `subscriptions_author_id_idx` (contador de seguidores).

### Tabla `reading_history`

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `uuid` | PK |
| `user_id` | `uuid` | → `profiles.id` |
| `post_id` | `uuid` | → `posts.id` |
| `read_at` | `timestamptz` | Última lectura |

Restricción `UNIQUE (user_id, post_id)`. Índice `reading_history_user_id_idx`.

### Índices del feed

`posts_published_at_idx` (parcial, `where status = 'published'`) y `post_tags_tag_id_idx`.

### RLS

| Tabla | Acción | Regla |
| :--- | :--- | :--- |
| `subscriptions` | SELECT | Público (permite mostrar el contador) |
| `subscriptions` | INSERT / DELETE | Solo el propio `follower_id` |
| `reading_history` | SELECT | Solo el propio `user_id` |
| `reading_history` | INSERT / UPDATE | Solo el propio `user_id` **y solo sobre posts publicados** |

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **El feed vive en `/`, no en `/feed`** | Una ruta `/feed` separada de la portada (el diseño original) | **El motivo del cambio no quedó registrado** ([ADR 0021](../adr/0021-feed-en-raiz-y-global.md)). Efecto observable: la portada es útil con o sin sesión, sin una pantalla "vacía" para visitantes †. Costo: los documentos y marcadores viejos que citan `/feed` reciben 404 (hay un test que lo verifica) |
| **Feed global cronológico, sin filtrar por seguidos** | Feed "solo de quienes sigo" | **Motivo no registrado**: el diseño original lo dejaba fuera del mínimo. Posible razón †: un feed de seguidos exige decidir cómo mezclarlo con lo demás y es un flujo más que probar. El seguimiento queda como base para agregarlo ([ADR 0021](../adr/0021-feed-en-raiz-y-global.md)) |
| **Paginación por `offset` con desempate por `id`** | Cursor por `(published_at, id)` | Simple y suficiente a este volumen †. Costo: si llegan posts nuevos entre página y página, pueden repetirse elementos; `FeedList` descarta duplicados de la primera página |
| **Registrar lecturas de mejor esfuerzo** | Bloquear la lectura si falla el registro | La lectura nunca depende de un dato secundario |
| **`reading_history` solo para artículos** | Registrar también las notas | Las recomendaciones puntúan artículos por tags ([PRD-4](PRD-4-recommendations.md)); una nota no tiene tags |
| **Seguimiento idempotente + optimista** | Toggle en el servidor; esperar la respuesta antes de pintar | Un doble click o un reintento no invierte el resultado (verificable en `followAuthor`/`unfollowAuthor`); la UI responde al instante † |
| **Contador de seguidores público (RLS SELECT público)** | Solo visible para el autor | Permite mostrarlo a cualquiera sin una función especial |

## Criterios de aceptación

- [x] El feed muestra solo posts `published` (nunca borradores) y `/feed` da 404.
- [x] `/?tag=x` reduce los resultados; una etiqueta inválida se ignora.
- [x] Un visitante sin sesión ve el feed y un enlace "Seguir" que lleva a `/login`.
- [x] Seguir y dejar de seguir se refleja al instante; no se crean relaciones duplicadas ni el autoseguimiento.
- [x] El autor no ve botón "Seguir" en su propio perfil.
- [x] Abrir un artículo autenticado dos veces no crea dos filas en `reading_history`.
- [x] `/author/<id inválido o inexistente>` da 404.

## Limitaciones conocidas y deuda

| Tema | Detalle |
| :--- | :--- |
| **Pestaña "Subscriptions" vacía** | Siempre muestra "No subscriptions yet.". No hay lista de a quién sigue ni de seguidores |
| Etiquetas de la vista de perfil en inglés | "Activity", "Posts", "Replies", "Likes", "Subscriptions", "Edit profile", "See subscribers" |
| Seguir no afecta al feed | Ningún ranking ni filtro usa las suscripciones |
| Paginación por offset | Puede repetir elementos si hay publicaciones nuevas entre páginas |
| Tope de 50 | Perfil: 50 publicaciones y 50 me gusta; no hay paginación en el perfil |
| Tags no visibles en el feed | La fila de tags está en `/explore` ([PRD-9](PRD-9-explore-activity.md)); en `/` solo se filtra por URL |
| e2e | `e2e/feed.spec.ts` usa un helper de publicación del flujo anterior del editor (`createDraft` busca un botón "Nuevo post" inexistente y agrega tags en línea), así que los tests que publican no reflejan la interfaz actual. Los e2e no se ejecutaron al escribir este PRD: la conclusión sale de leer `e2e/` contra `src/` |

## Pruebas

| Tipo | Archivo | Cubre |
| :--- | :--- | :--- |
| Unitarias | `src/features/posts/schemas.test.ts` (`feedQuerySchema`, `tagNameSchema`) | Validación del filtro y la paginación |
| e2e | `e2e/feed.spec.ts` | El feed vive en `/`, `/feed` da 404, el filtro por tag, los tags no se muestran, los borradores no aparecen, un autor inexistente da 404, seguir/dejar de seguir, sin botón en el perfil propio, enlace de login para visitantes |
