# PRD-3.3 — Perfil público de autor (`/author/[id]`)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-3 — Feed y seguimiento](PRD-3-feed-follows.md) |
| Dificultad / Esfuerzo | B (básica) / S (hasta 1 día) |
| Dueño sugerido / Mentor | D12 / D3 |
| Depende de | [PRD-3.1](PRD-3.1-follow-system.md) (`FollowButton`, contador), [PRD-3.2](PRD-3.2-feed-list.md) (`PostCard`, `FeedPost`), [PRD-1.3](PRD-1.3-profile-settings.md) (`getPublicProfile`) |
| Se conecta con | [PRD-7.2](PRD-7.2-notes-ui.md) (`CreatePostMenu` y `NoteTriggerBar` en el perfil propio) |
| Código | `src/app/(public)/author/[id]/page.tsx`, `src/features/profile/components/AuthorProfileView.tsx`, `getPublicProfile` en `src/features/profile/queries.ts`, `getPublishedPostsByAuthor` y `getLikedPostsByUser` en `src/features/posts/queries.ts` |
| ADRs | [0002](../adr/0002-un-solo-tipo-de-usuario.md) |

## Resumen

La página pública de una persona: su nombre, `@username`, cuántos seguidores tiene, un botón para seguirla (o, si es tu propio perfil, "Crear" y "Edit profile") y **pestañas** con su actividad: publicaciones, respuestas y me gusta. En este proyecto no hay "autores" y "lectores" como roles ([ADR 0002](../adr/0002-un-solo-tipo-de-usuario.md)): cualquier usuario tiene su perfil, y `/profile` simplemente redirige al tuyo.

## Qué necesitás entender antes

- [ ] Rutas dinámicas `[id]` y `notFound()` en Next.js.
- [ ] Componentes cliente y `useState` para cambiar de pestaña **sin** cambiar la URL.
- [ ] `useMemo` (recordar un cálculo mientras no cambien sus dependencias) y `Array.filter`.
- [ ] Renderizado condicional (perfil propio vs. ajeno).
- [ ] `Promise.all` para pedir varias cosas a la vez.
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| La página `/author/[id]` y `AuthorProfileView` | `PostCard` y sus botones (feed): [PRD-3.2](PRD-3.2-feed-list.md) |
| Las pestañas Activity, Posts, Replies, Likes, Subscriptions | Editar el perfil (`/settings`): [PRD-1.3](PRD-1.3-profile-settings.md) |
| Menú de opciones del perfil (copiar enlace, compartir) | El menú "Crear" y la barra de notas: [PRD-7.2](PRD-7.2-notes-ui.md) |
| Los estados vacíos de cada pestaña | Contar/seguir: [PRD-3.1](PRD-3.1-follow-system.md) |

## Cómo funciona

Orden de lectura: `getPublicProfile` → `page.tsx` → `AuthorProfileView.tsx`.

### 1. La página (servidor)

`page.tsx` toma el `id` de la URL y:

1. `getPublicProfile(id)`: valida el uuid y pide `id, display_name, username, created_at`; si no existe → `notFound()` (404). (No pide `avatar_url`: el avatar es solo las iniciales.)
2. `getViewer()` para saber quién mira.
3. En paralelo (`Promise.all`): `getPublishedPostsByAuthor` (hasta 50 publicados), `getLikedPostsByUser` (hasta 50 posts a los que **ese autor** dio me gusta, solo publicados), `getFollowerCount` y, si mirás el perfil de otra persona con sesión, `isFollowing`.
4. Le pasa todo a `AuthorProfileView` como props.

### 2. La vista (cliente)

`AuthorProfileView` mantiene `activeTab` en `useState`. Con `useMemo` calcula la lista de la pestaña activa:

| Pestaña | Contenido |
| :--- | :--- |
| Activity | Todas las publicaciones del autor |
| Posts | Artículos y notas que **no** son respuestas (`type === "article" \|\| !parent`) |
| Replies | Solo notas que responden a otro post |
| Likes | Los posts que el autor marcó con me gusta |
| Subscriptions | **Siempre vacía**: muestra "No subscriptions yet." (no se carga ningún dato) |

Cabecera: nombre, `@username`, un botón-píldora con el nombre, el contador de seguidores ("See subscribers" con 0 o "N subscriber(s)"; **no es un enlace**) y un avatar grande con iniciales. Acciones según quién mira:

| Quién mira | Ve |
| :--- | :--- |
| El propio autor | "Crear" ([7.2](PRD-7.2-notes-ui.md)), "Edit profile" (→ `/settings`), un menú de opciones (copiar enlace, compartir) y, en Activity y Posts, la barra para escribir una nota |
| Otra persona (con o sin sesión) | `FollowButton` ([3.1](PRD-3.1-follow-system.md)) |

`handleCopyLink` usa `navigator.clipboard`; `handleShare` usa `navigator.share` si el navegador lo tiene y, si no, copia el enlace.

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| Un perfil para todo usuario (no "perfil de autor" vs "de lector") | Un solo tipo de usuario ([ADR 0002](../adr/0002-un-solo-tipo-de-usuario.md)) |
| Pestañas en estado de cliente, sin cambiar la URL | Más simple: no hay rutas ni consultas por pestaña †; contrapartida: no se puede enlazar a una pestaña concreta |
| Tope de 50 publicaciones y 50 me gusta, sin paginar | Evita consultas enormes con poco esfuerzo †; el porqué del número no quedó registrado |
| El contador de seguidores no es un enlace | No existe una lista de seguidores todavía |

## Criterios de aceptación

- [ ] `/author/<id inválido o inexistente>` da 404.
- [ ] El perfil muestra nombre, `@username` y el contador correcto de seguidores.
- [ ] En perfil ajeno hay botón de seguir; en el propio, "Crear", "Edit profile" y el menú de opciones.
- [ ] Cada pestaña filtra bien; una pestaña sin datos muestra su mensaje vacío.
- [ ] "Copiar link del perfil" cambia a "Enlace copiado" y cierra el menú.
- [ ] `/profile` (con sesión) redirige a tu perfil.

## Cómo verificarla a mano

1. `pnpm seed:dev` ([PRD-X.2](PRD-X.2-dev-tooling.md)) y `pnpm dev`.
2. Abrí el perfil de un usuario del seed: revisá las 5 pestañas. La de "Subscriptions" debe estar vacía (es un pendiente conocido).
3. Publicá una nota que responda a un post ([PRD-7.2](PRD-7.2-notes-ui.md)) y verificá que aparece en Replies y **no** en Posts.
4. Dá me gusta a un post de otro autor y mirá tu pestaña Likes.
5. Abrí `/author/abc`: 404. Abrí `/profile` con y sin sesión.
6. e2e relacionados: `e2e/feed.spec.ts` ("invalid or unknown author ids are 404", botón de seguir, sin botón en perfil propio).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Traducir las etiquetas en inglés a español: "Activity", "Posts", "Replies", "Likes", "Subscriptions", "Edit profile", "See subscribers", "subscriber(s)", "More options", "No … yet." (elegir criterio y aplicarlo a todas) | B |
| Implementar la pestaña "Subscriptions" (lista de a quién sigue): consulta nueva + tarjetas ([PRD-3.1](PRD-3.1-follow-system.md)) | M |
| Convertir el contador en un enlace y listar seguidores | M |
| Avatar real: `profiles.avatar_url` existe en la base pero no se usa ni se pide | A |
| Paginar el perfil (hoy tope de 50) | M |

## Preguntas de autoevaluación

1. ¿Por qué las pestañas no cambian la URL? ¿Qué se pierde con eso?
2. ¿Cuál es la diferencia entre las pestañas Activity y Posts?
3. ¿Qué datos se piden en el servidor y cuáles se calculan en el cliente con `useMemo`?
4. ¿Qué ve el visitante sin sesión en un perfil ajeno?
5. ¿Por qué el perfil se ve igual para "autores" y "lectores"?
6. ¿Por qué la pestaña Subscriptions está vacía aunque haya seguimientos en la base?
