# PRD-3.2 — Feed de la portada (`/`) y "Cargar más"

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-3 — Feed y seguimiento](PRD-3-feed-follows.md) |
| Dificultad / Esfuerzo | M (media) / M (2-3 días) |
| Dueño sugerido / Mentor | D11 / D3 |
| Depende de | [PRD-2.1](PRD-2.1-posts-data-rls.md) (tabla `posts` y RLS), [PRD-3.1](PRD-3.1-follow-system.md) (`getFollowedAuthorIds`), [PRD-0.3](PRD-0.3-app-shell.md) (el marco de la página) |
| Se conecta con | [PRD-4.2](PRD-4.2-recs-query-ui.md) (sección de recomendados en `/`), [PRD-7.2](PRD-7.2-notes-ui.md) (barra "¿Qué estás pensando?" y menú Crear), [PRD-7.3](PRD-7.3-likes.md) (`LikeButton`), [PRD-9.1](PRD-9.1-explore-page.md) (`/explore` reutiliza `FeedList`), [PRD-9.3](PRD-9.3-post-options-drawer.md) (menú de cada tarjeta) |
| Código | `src/app/(public)/page.tsx`, `getFeedPage` y sus ayudas en `src/features/posts/queries.ts`, `loadMoreFeed` en `src/features/posts/actions.ts`, `src/features/posts/components/FeedList.tsx`, `PostCard.tsx`, `ArticleCard.tsx`, `feedQuerySchema` en `schemas.ts` |
| ADRs | [0004](../adr/0004-recomendaciones-scoring-determinista.md), [0009](../adr/0009-tipos-de-post-y-likes.md), [0020](../adr/0020-tags-como-metadato-interno.md), [0021](../adr/0021-feed-en-raiz-y-global.md) |

## Resumen

La portada (`/`) muestra los posts **publicados**, notas y artículos mezclados, del más nuevo al más viejo, **de a 20**, con un botón "Cargar más". Funciona con o sin sesión. Es el paquete que más consultas coordina: además de los posts, cada tarjeta necesita saber si seguís al autor, cuántos me gusta y notas tiene, y si es una respuesta a otro post.

## Qué necesitás entender antes

- [ ] Server Components `async` y `searchParams` (`?tag=`) en Next.js.
- [ ] Componentes cliente y `useState` / `useTransition`.
- [ ] Paginación por **offset**: pedir "las filas desde la N".
- [ ] Qué es una consulta con **relaciones** (`select` con tablas embebidas de Supabase) y un `INNER JOIN`.
- [ ] `Promise.all`: lanzar varias consultas a la vez.
- [ ] Qué es un **tipo unión discriminado** (`FeedPost = ArticleFeedPost | NoteFeedPost`, distinguidos por `type`).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `getFeedPage`, paginación, filtro por `?tag=` | La fila de chips de tags y `/explore`: [PRD-9.1](PRD-9.1-explore-page.md) |
| `FeedList` (cliente) y `loadMoreFeed` (acción) | El cálculo de recomendados: [PRD-4.1](PRD-4.1-scoring-core.md) / [PRD-4.2](PRD-4.2-recs-query-ui.md) |
| `PostCard` y `ArticleCard` (cómo se ve cada tarjeta) | Botón de "me gusta": [PRD-7.3](PRD-7.3-likes.md); nota (`NoteItem`), compositor y menú Crear: [PRD-7.2](PRD-7.2-notes-ui.md); menú de opciones: [PRD-9.3](PRD-9.3-post-options-drawer.md) |
| Estados vacíos del feed | Un feed "solo de quienes sigo" (no existe, [ADR 0021](../adr/0021-feed-en-raiz-y-global.md)) |

## Cómo funciona

Orden de lectura: `schemas.ts` (`feedQuerySchema`) → `getFeedPage` y `hydrateFeedPosts` (`queries.ts`) → `actions.ts` (`loadMoreFeed`) → `FeedList.tsx` → `PostCard.tsx` / `ArticleCard.tsx` → `page.tsx`.

### 1. `getFeedPage({ tag, offset })`

```text
consulta posts con status = 'published'         (explícito: RLS también deja ver mis borradores)
  + autor (profiles) + cuenta de likes
  si hay tag: + INNER JOIN post_tags/tags y filtra por tags.name = tag
orden: published_at descendente, luego id       (desempate estable)
rango: filas [offset, offset + 20]              (21 filas: la 21ª solo sirve para saber si hay más)
hasMore = se recibieron más de 20
posts   = hydrateFeedPosts(las primeras 20)
```

`FEED_PAGE_SIZE = 20`. El tag se usa **solo para filtrar**: no se pide para mostrarlo (los tags no se muestran en las tarjetas, [ADR 0020](../adr/0020-tags-como-metadato-interno.md)).

### 2. `hydrateFeedPosts`: completar cada tarjeta

Las filas crudas traen poco. Para no hacer una consulta por tarjeta (el clásico problema **N+1**), se juntan los ids y se hacen **4 consultas en paralelo** (`Promise.all`) para toda la página:

| Consulta | Devuelve | Cuándo |
| :--- | :--- | :--- |
| `getFollowedAuthorIds` ([3.1](PRD-3.1-follow-system.md)) | a qué autores sigo | con sesión |
| `getLikedPostIds` ([7.3](PRD-7.3-likes.md)) | qué posts ya likeé | con sesión |
| `getParentRefs` | el post original de cada nota-respuesta (solo si está publicado) | siempre |
| `getNotesCounts` | cuántas notas tiene cada post | siempre |

`toFeedPost` arma un objeto final: para un **artículo** `{ type: "article", title, excerpt }` (el extracto lo hace `excerpt()` sobre el markdown) y para una **nota** `{ type: "note", content, parent }`.

### 3. `loadMoreFeed` y `FeedList`

`loadMoreFeed({ tag, offset })` es una Server Action que valida con `feedQuerySchema` (`offset` entero entre 0 y 10 000; el tag se normaliza) y, si algo no valida, devuelve una página vacía en vez de fallar. `FeedList` (cliente) recibe la **primera página por props** (siempre viene fresca del servidor, así una nota nueva aparece tras revalidar) y guarda en estado solo las páginas de "Cargar más": pide con `offset = primera página + ya cargadas`, **descarta duplicados** de la primera página y oculta los posts que el usuario borró (`onDeleted`).

### 4. La página `/` (`page.tsx`)

1. Lee `searchParams.tag` y lo valida con `tagNameSchema`; un tag inválido se **ignora**.
2. Lanza `getFeedPage` y, con la sesión (`getViewer`), lanza también los recomendados **antes** de esperar el feed, para que las consultas se solapen; los recomendados van dentro de `Suspense` para no bloquear el feed ([PRD-4.2](PRD-4.2-recs-query-ui.md)). Solo se piden si hay sesión **y** no hay filtro de tag.
3. Con sesión muestra la barra "¿Qué estás pensando?" y el menú "Crear" ([PRD-7.2](PRD-7.2-notes-ui.md)).
4. Si no hay posts muestra "Todavía no hay publicaciones." (o "No hay publicaciones con ese tag."). Si hay, dibuja `FeedList` con `key={tag ?? "all"}`: al cambiar el filtro React descarta el estado de "Cargar más".

### 5. Las tarjetas

`PostCard` es una rejilla avatar + contenido: nombre del autor (enlace a su perfil), fecha relativa, `FollowControl` (según sesión: nada si es tu propia tarjeta, enlace "Seguir" con `LoginDrawer` si no hay sesión, `FollowButton` si la hay), menú de opciones, el cuerpo (`ArticleCard` para artículos, `NoteItem` para notas), `LikeButton` y un enlace a las notas del post. `ArticleCard` muestra título ("Sin título" si falta) y un extracto de hasta 3 líneas.

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| El feed vive en `/` y es global | El motivo de sacar `/feed` y de no filtrar por seguidos **no quedó registrado** ([ADR 0021](../adr/0021-feed-en-raiz-y-global.md)); efecto: la portada sirve a visitantes y a usuarios † |
| Paginación por `offset` con desempate por `id` | Simple y suficiente a este volumen †. Costo: si entran posts nuevos entre páginas, pueden repetirse; `FeedList` filtra los repetidos de la primera página |
| Pedir 21 filas para devolver 20 | Saber si hay más sin una consulta de conteo aparte |
| Hidratar por lotes (4 consultas por página) | Evita N+1: el costo no crece con el número de tarjetas |
| Primera página desde el servidor, resto en estado del cliente | Los cambios (una nota nueva) se ven al revalidar sin perder lo cargado † |
| Filtrar `status = 'published'` explícitamente | RLS deja ver también los borradores propios; sin el filtro aparecerían en tu feed |

## Criterios de aceptación

- [ ] `/` muestra solo posts publicados (nunca borradores) y `/feed` responde 404.
- [ ] Orden: el más reciente arriba; "Cargar más" agrega 20 más y desaparece cuando no hay más.
- [ ] `/?tag=x` reduce la lista; un tag inválido se ignora y muestra todo.
- [ ] Notas y artículos se ven con su tarjeta correcta; una nota-respuesta muestra "En respuesta a …".
- [ ] Sin sesión: el feed se ve y "Seguir" abre el login.
- [ ] Con sesión y sin filtro, aparece la sección de recomendados arriba del feed.

## Cómo verificarla a mano

1. `pnpm seed:dev` ([PRD-X.2](PRD-X.2-dev-tooling.md)) para tener posts de varios autores; `pnpm dev` y abrí `/`.
2. Contá las tarjetas antes de "Cargar más": deben ser 20. Pulsá el botón y verificá que no se repiten.
3. Probá `/?tag=ia` y `/?tag=` (vacío) y `/?tag=%20`: los inválidos deben ignorarse.
4. Publicá una nota nueva: debe aparecer arriba al volver a `/`.
5. `pnpm test`: `src/features/posts/schemas.test.ts` (`feedQuerySchema`). e2e: `e2e/feed.spec.ts`; los tests que **publican** están desactualizados ([PRD-X.1](PRD-X.1-testing-e2e.md)).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Un comentario de `page.tsx` dice que los tags no se muestran "en ninguna parte", pero `/explore` los muestra: corregir el comentario | B |
| `loadMoreFeed` no maneja el caso de error de la consulta (la excepción sube al `error.tsx`): mostrar un mensaje y dejar reintentar en `FeedList` | B |
| Migrar de `offset` a paginación por cursor `(published_at, id)` para evitar repetidos | A |
| Extraer `toFeedPost` como función pura exportada y agregarle tests (hoy no tiene tests) | M |
| Mostrar un esqueleto (`loading.tsx`) mientras carga el feed | M |

## Preguntas de autoevaluación

1. ¿Por qué se piden 21 filas y se devuelven 20?
2. ¿Qué es el problema N+1 y cómo lo evita `hydrateFeedPosts`?
3. ¿Qué pasa si escribo `/?tag=<300 caracteres>`? ¿Dónde se valida?
4. ¿Por qué `FeedList` recibe la primera página por props y no la guarda en su estado?
5. ¿Por qué el filtro `status = 'published'` es explícito si RLS ya protege los borradores?
6. ¿Qué cambia en `/` entre un visitante y un usuario con sesión?
