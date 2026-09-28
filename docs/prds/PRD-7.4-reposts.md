# PRD-7.4 — Reposts

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-7 — Notas y me gusta](PRD-7-notes-likes.md) |
| Dificultad / Esfuerzo | A (avanzada) / L (más de tres días) |
| Dueño sugerido / Mentor | D3 (implementado) / — |
| Depende de | [PRD-7.1](PRD-7.1-post-types-db.md) (RLS de posts publicados), [PRD-3.1](PRD-3.1-follow-system.md) (feed "Siguiendo"), [PRD-3.3](PRD-3.3-author-profile.md) (pestañas del perfil público) |
| Alimenta a | [PRD-3.2](PRD-3.2-feed-list.md) y [PRD-2.6](PRD-2.6-post-detail.md) (muestran el botón y el feed interleavado), [PRD-3.3](PRD-3.3-author-profile.md) (pestaña Reposts del perfil) |
| Migraciones | `supabase/migrations/0017_reposts.sql` |
| Código | `src/features/reposts/actions.ts` (`setRepost`), `queries.ts` (`getRepostedPostIds`, `getRepostCounts`, `getRepostsByUser`), `schemas.ts`, `components/RepostButton.tsx`; consumido desde `src/features/posts/queries.ts` (`hydrateFeedPosts`, `getFeedPage`, `getRepostedPostsByUser`), `src/app/(public)/p/[id]/page.tsx` y `src/features/profile/components/AuthorProfileView.tsx` |
| ADRs | Ninguno propio; sigue el patrón de [0009](../adr/0009-tipos-de-post-y-likes.md) (likes) |

> **Nota de procedencia.** El comentario de cabecera de la migración `0017_reposts.sql` dice "PRD 7.3: Reposts", pero [PRD-7.3](PRD-7.3-likes.md) es sobre **me gusta**, no reposts — quedó mal referenciado al escribirlo. Este documento (7.4) es el PRD real de la feature, escrito después de auditar el código existente.

## Resumen

Republicar un post: un botón (ícono de flechas circulares) que agrega o quita una fila en `reposts`, con conteo y estado optimista, igual en espíritu a "me gusta" ([PRD-7.3](PRD-7.3-likes.md)) pero con dos diferencias de fondo: **alimenta el feed** ("Siguiendo" muestra los reposts recientes de a quién seguís, no solo sus posts propios) y **alimenta el perfil público** (pestaña "Reposts" en `AuthorProfileView`). Funciona sobre **posts publicados** (artículos y notas).

## Qué necesitás entender antes

- [ ] Actualización optimista con `useOptimistic` y `useTransition` (mismo patrón que [PRD-7.3](PRD-7.3-likes.md#el-botón-likebuttontsx)).
- [ ] Qué es una restricción `UNIQUE (user_id, post_id)` y un `upsert` con `ignoreDuplicates`.
- [ ] Cómo un post puede aparecer en el feed por dos motivos distintos (publicado por a quién seguís, o repostado por a quién seguís) sin duplicarse.
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `setRepost`, `getRepostedPostIds`, `getRepostCounts`, `getRepostsByUser`, `RepostButton` y su esquema Zod | La tabla `reposts` en sí ya es de este paquete (no se partió como `likes`/PRD-7.1) |
| El repost aparece en el feed "Siguiendo" con la etiqueta de quién lo repostó | Reposts en el feed "Para vos" (recomendado) o "Explorar" |
| La pestaña "Reposts" del perfil público | Republicar con comentario ("quote repost") — no existe |
| Contar y mostrar el repost propio en `/p/[id]` y en las tarjetas del feed | Notificar al autor original cuando alguien reposta su post |

## Cómo funciona

Orden de lectura sugerido: `schemas.ts` → `actions.ts` → `queries.ts` → `RepostButton.tsx` → cómo se integra en `posts/queries.ts` (`hydrateFeedPosts`, el fan-in de reposts en `getFeedPage`) → `getRepostedPostsByUser` y su uso en `AuthorProfileView.tsx`.

### La acción: mismo patrón que `setLike`

```text
setRepost(postId, reposted):
  validar { postId: uuid, reposted: boolean }        -> si no es válido: { ok: false }
  requireUser                                        (sin sesión, lo bloquea el guard del botón)
  reposted = true   -> upsert en reposts (user_id, post_id) con ignoreDuplicates
  reposted = false  -> delete de (user_id, post_id)
  revalidar "/" y "/p/<id>"
  devolver { ok: !error }
```

Recibe el **estado deseado** (`reposted`), no un "toggle" — igual razonamiento que `setLike`: un doble clic o un reintento no puede dejar el resultado invertido.

### El botón (`RepostButton.tsx`)

- **Sin sesión** (`viewerId` vacío): el ícono y el conteo quedan dentro de un `LoginDrawer`; al pulsarlo se abre el login (igual que `LikeButton`).
- **Con sesión:** guarda dos estados locales, `confirmed` (lo último que confirmó el servidor) y `seen` (el último valor de props recibido). Si `initialReposted`/`initialCount` cambian respecto a `seen` (el servidor mandó props nuevas, p. ej. al revalidar), resincroniza `confirmed` **durante el render** — necesario porque, a diferencia de `LikeButton`, las listas paginadas del feed reordenan y reinsertan posts al cargar más páginas, y el componente puede recibir props nuevas para el mismo `postId` sin desmontarse.
- Al pulsar, calcula el valor siguiente (`reposted` invertido, conteo ±1 sin bajar de 0), lo aplica con `useOptimistic` dentro de `startTransition`, llama a `setRepost` y, si el servidor confirma, promueve ese valor a `confirmed`. Si falla, `useOptimistic` descarta el valor optimista y la interfaz vuelve sola al último `confirmed`.
- Accesibilidad: `aria-pressed` y `aria-label` que cambia ("Republicar" / "Deshacer republicación").

### De dónde salen los datos en el feed

- **Conteo y "¿lo reposteé?":** igual que likes, se resuelven en batch para toda la página (`getRepostCounts`, `getRepostedPostIds`) dentro de `hydrateFeedPosts`, no por post.
- **Reposts de a quién seguís, en el feed "Siguiendo":** además de los posts propios de los autores seguidos, `getFeedPage` (scope `following`, primera página) hace una consulta aparte a `reposts` filtrada por los autores seguidos, resuelve los posts repostados que **no** están ya en la página por publicación directa (evita duplicados con un `Set` de ids ya vistos), los hidrata igual que cualquier post y les agrega `reposterName`/`repostedAt`. La lista final (`directPosts` + `repostFeedPosts`) se ordena por `repostedAt ?? publishedAt`, así un repost reciente de un post viejo aparece arriba, como en el feed de X/Twitter.
- **Pestaña "Reposts" del perfil:** `getRepostedPostsByUser(authorId, reposterName)` trae los posts que esa persona repostó, con `reposterName`/`repostedAt` ya pisados. `AuthorProfileView` la combina con `posts`/`likedPosts` según la pestaña activa, filtrando en la pestaña "Posts" que un repost propio de un artículo/nota sin padre no tape al post original si ya está en la lista (`byId.set` con reposts pisando para priorizar el sello de repost).
- Degradación: si la migración `0017` todavía no corrió en un entorno, todas las consultas de `reposts/queries.ts` atrapan `42P01`/`PGRST205`/"schema cache" y devuelven listas o conteos vacíos en vez de romper el feed (mismo espíritu defensivo que el resto de `posts/queries.ts`).

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| `setRepost` recibe el estado deseado, no un "toggle" | `toggleRepost` | Idempotente, igual que `setLike` |
| El repost alimenta el feed "Siguiendo" (no solo cuenta en el post) | Un repost es solo un contador, invisible en el feed | El feed de a quién seguís muestra más que sus posts propios — es lo que hace de "repost" una feature de descubrimiento y no un simple contador; costo: una consulta y un merge extra en `getFeedPage` |
| Solo posts publicados (RLS) † | Cualquier post | Igual razonamiento que `likes`: la clave foránea ignora RLS y permitiría repostear un borrador |
| Sin "quote repost" (comentario al republicar) † | Permitir un texto opcional al repostear | Menor alcance, coherente con KISS; se puede sumar después sin romper el esquema (`reposts` no tiene columna de contenido) |
| Sin notificación al autor original † | Insertar una fila en `notifications` al repostear | No estaba en el alcance auditado del código; si se agrega, es un paquete aparte sobre `notifications` |

## Criterios de aceptación

- [ ] Repostear y deshacer un repost cambia el ícono y el conteo al instante.
- [ ] Un doble clic rápido no deja el estado invertido ni duplica filas (`UNIQUE (user_id, post_id)`).
- [ ] Un visitante sin sesión ve el conteo y, al pulsar, se abre el login.
- [ ] No se puede repostear un borrador (lo impide la política de `insert`).
- [ ] El feed "Siguiendo" muestra un post repostado por alguien seguido aunque su autor no esté entre los seguidos, con el nombre de quién lo reposteó.
- [ ] La pestaña "Reposts" del perfil público lista los posts que esa persona reposteó, ordenados por fecha del repost.
- [ ] Recargar la página muestra el mismo estado y conteo.

## Cómo verificarla a mano

1. `pnpm test`: `src/features/posts/interleave.test.ts` cubre el interleaving del feed (usa `repostCount`/`viewerReposted` en sus fixtures); no hay un `schemas.test.ts` propio de `reposts` todavía (ver "Trabajo pendiente asignable").
2. Con sesión, abrí `/p/<id>` y pulsá el botón de repost: cambia al instante. Recargá: sigue marcado.
3. Segui a otra cuenta, reposteá un post con esa cuenta (o pedile a alguien que lo haga) y confirmá que aparece en tu `/` (feed "Siguiendo") con el sello de quién lo reposteó, aunque no sigas a su autor original.
4. Entrá a `/<username>` de quien reposteó y confirmá que aparece en su pestaña "Reposts".
5. En el SQL Editor: `select * from public.reposts;` para ver una fila por usuario y post.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| No hay `schemas.test.ts` para `setRepostSchema` (a diferencia de `likes`): agregarlo | B |
| No hay pruebas e2e de repost (dar, deshacer, verlo en el feed de "Siguiendo") | M |
| El comentario de la migración `0017_reposts.sql` referencia mal a "PRD 7.3": corregirlo a "PRD 7.4" en el mismo cambio que se toque ese archivo | B |
| Evaluar si un repost debería notificar al autor original (nueva fila en `notifications`, fuera de alcance de este paquete) | M |

## Preguntas de autoevaluación

1. ¿Por qué `setRepost` recibe `reposted` en vez de "alternar" el estado?
2. ¿Qué hace que un post repostado por alguien que seguís aparezca en tu feed aunque no sigas a su autor?
3. ¿Cómo evita el feed mostrar el mismo post dos veces si ya estaba ahí por publicación directa?
4. ¿Por qué `RepostButton` resincroniza su estado "confirmado" durante el render en vez de solo al montarse, a diferencia de `LikeButton`?
5. ¿Qué impide repostear un borrador? ¿Dónde vive esa regla?
6. ¿Por qué este paquete no es "quote repost" (repostear con un comentario propio)?
