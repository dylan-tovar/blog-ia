# PRD-7.3 — Me gusta

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-7 — Notas y me gusta](PRD-7-notes-likes.md) |
| Dificultad / Esfuerzo | B (básica) / S (hasta 1 día) |
| Dueño sugerido / Mentor | D7 / D6 (apoyo entre pares; escala a D2 o D1) |
| Depende de | [PRD-7.1](PRD-7.1-post-types-db.md) (tabla `likes` y sus políticas), [PRD-1.1](PRD-1.1-auth-forms.md) (`LoginDrawer` para visitantes) |
| Alimenta a | [PRD-3.2](PRD-3.2-feed-list.md) y [PRD-2.6](PRD-2.6-post-detail.md) (muestran el botón), [PRD-3.3](PRD-3.3-author-profile.md) (pestaña Likes) |
| Código | `src/features/likes/actions.ts` (`setLike`), `queries.ts` (`getLikedPostIds`), `schemas.ts`, `components/LikeButton.tsx`; el conteo sale de `LIKES_EMBED` en `src/features/posts/queries.ts` |
| ADRs | [0009](../adr/0009-tipos-de-post-y-likes.md) |

## Resumen

El corazón de "me gusta" de cada post: un botón que cambia al instante (optimista), un conteo, una Server Action que guarda el cambio y una tabla `likes` con una fila por usuario y post. Funciona en **notas y artículos publicados**. Un visitante sin sesión ve el conteo y, al pulsarlo, se le invita a iniciar sesión.

## Qué necesitás entender antes

- [ ] Qué es un **botón que actualiza la interfaz antes de que responda el servidor** (actualización optimista) y qué pasa si el servidor falla.
- [ ] `useOptimistic` y `useTransition` de React.
- [ ] Qué significa que una operación sea **idempotente**: repetirla no cambia el resultado.
- [ ] Qué es una restricción `UNIQUE (user_id, post_id)`.
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `setLike`, `getLikedPostIds`, `LikeButton` y el esquema Zod | La tabla y sus políticas RLS: [PRD-7.1](PRD-7.1-post-types-db.md) |
| El conteo en la interfaz | La pestaña "Likes" del perfil: [PRD-3.3](PRD-3.3-author-profile.md) |
| El comportamiento para visitantes | Ordenar el feed por popularidad (no existe) |

## Cómo funciona

Orden de lectura sugerido: `schemas.ts` → `actions.ts` → `LikeButton.tsx` → cómo llegan `initialLiked` y `initialCount` (`LIKES_EMBED`, `hydrateFeedPosts` en `posts/queries.ts`).

### La acción: recibe el **estado deseado**, no un "toggle"

```text
setLike(postId, liked):
  validar { postId: uuid, liked: boolean }          -> si no es válido: { ok: false }
  requireUser                                       (sin sesión redirige a /login)
  liked = true   -> upsert en likes (user_id, post_id) con ignoreDuplicates
  liked = false  -> delete de (user_id, post_id)
  revalidar "/" y /post/<id>
  devolver { ok: !error }
```

Como pide el estado que **quiere** el usuario (`liked`) en vez de "invertir", un doble clic o un reintento **no puede dejar el resultado invertido**: repetir "quiero que me guste" siempre da "me gusta". Además el `upsert` con `ignoreDuplicates` no falla si la fila ya existe.

### El botón (`LikeButton.tsx`)

- **Sin sesión** (`viewerId` vacío): muestra el corazón y el conteo dentro de un `LoginDrawer`; al pulsarlo se abre el login.
- **Con sesión:** al pulsar calcula el valor siguiente (`liked` invertido y conteo ±1, nunca por debajo de 0), lo muestra **al instante** con `useOptimistic` y llama a `setLike`. Si el servidor confirma, ese valor pasa a ser el "confirmado"; si falla, la interfaz vuelve sola al valor anterior.
- Las listas paginadas conservan datos del servidor en estado del cliente y no reenvían props; por eso el botón guarda el valor confirmado y se **resincroniza** cuando el servidor manda props nuevas.
- Accesibilidad: `aria-pressed` y una etiqueta que cambia ("Me gusta" / "Quitar me gusta").

### De dónde salen los datos

- **Conteo:** `likes(count)` embebido al leer los posts (`LIKES_EMBED`). No hay columna `likes_count` cacheada.
- **"¿Ya le di me gusta?":** `getLikedPostIds(userId, postIds)` consulta las filas del usuario para los posts visibles.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **`setLike` recibe el estado deseado** (consta en la acción y su test de esquema) | `toggleLike` | Idempotente: sin resultados invertidos por dobles clics |
| **Actualización optimista** | Esperar al servidor | Respuesta instantánea; si falla, la interfaz vuelve atrás |
| **Sin `likes_count` cacheado** † | Contador en `posts` con triggers | A este volumen contar filas es trivial. Si el proyecto creciera sería la primera optimización |
| **Solo posts publicados** (RLS, [PRD-7.1](PRD-7.1-post-types-db.md)) | Cualquier post | La clave foránea ignora RLS y permitiría likear borradores |
| **Visitantes pueden ver el conteo** † | Ocultarlo | Se ve la actividad sin sesión; para participar hace falta iniciar sesión (el motivo no quedó registrado) |

## Criterios de aceptación

- [ ] Dar y quitar me gusta cambia el corazón y el conteo al instante.
- [ ] Un doble clic rápido no deja el estado invertido ni duplica filas.
- [ ] Un visitante ve el conteo y, al pulsar, se abre el login.
- [ ] No se puede dar me gusta a un borrador (lo impide la base).
- [ ] Recargar la página muestra el mismo estado y conteo.
- [ ] El botón anuncia su estado con `aria-pressed`.

## Cómo verificarla a mano

1. `pnpm test`: `src/features/likes/schemas.test.ts` cubre `setLikeSchema`.
2. Con sesión, abrí `/` y pulsá el corazón de un post: cambia al instante. Recargá: sigue marcado.
3. Pulsalo dos veces muy rápido: debe quedar en un estado coherente (marcado o no) y nunca ir por debajo de 0.
4. En una ventana privada (sin sesión), pulsá el corazón: debe abrirse el login.
5. En el SQL Editor: `select * from public.likes;` para ver una fila por usuario y post.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Si `setLike` falla, el botón vuelve al valor anterior pero no avisa al usuario: mostrar un mensaje breve | B |
| No hay pruebas e2e de me gusta: escribir una prueba (dar, quitar, recargar) ([PRD-X.1](PRD-X.1-testing-e2e.md)) | M |
| El conteo no se actualiza en tiempo real; solo al cargar o refrescar (no es una tarea urgente: documentar como límite conocido) | B |
| `getLikedPostIds` lanza un error si la consulta falla (a diferencia de otras consultas que degradan): decidir si la interfaz debe seguir sin esa información | M |

## Preguntas de autoevaluación

1. ¿Por qué `setLike` recibe `liked` en vez de "alternar" el estado?
2. ¿Qué hace `useOptimistic` y qué pasa si el servidor devuelve `ok: false`?
3. ¿Qué garantiza `UNIQUE (user_id, post_id)` y cómo lo usa el `upsert`?
4. ¿Por qué el conteo se calcula al leer en vez de guardarlo en `posts`?
5. ¿Por qué un visitante ve el botón pero no puede dar me gusta?
6. ¿Qué impide dar me gusta a un borrador? ¿Dónde vive esa regla?
