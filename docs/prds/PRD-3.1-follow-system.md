# PRD-3.1 — Sistema de seguimiento (seguir y dejar de seguir)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-3 — Feed y seguimiento](PRD-3-feed-follows.md) |
| Dificultad / Esfuerzo | M (media) / M (2-3 días) |
| Dueño sugerido / Mentor | D3 / D1 |
| Depende de | [PRD-1.2](PRD-1.2-auth-security.md) (`requireUser`), [PRD-0.2](PRD-0.2-ui-primitives.md) (`Button`) |
| Lo usan | [PRD-3.2](PRD-3.2-feed-list.md) (botón en cada tarjeta), [PRD-3.3](PRD-3.3-author-profile.md) (botón y contador en el perfil) |
| Código | `src/features/subscriptions/actions.ts`, `queries.ts`, `components/FollowButton.tsx`; en `supabase/migrations/0003_feed.sql` la tabla `subscriptions`, su índice y sus políticas |
| ADRs | [0003](../adr/0003-seguridad-rls-y-proxy-minimo.md), [0021](../adr/0021-feed-en-raiz-y-global.md) |

## Resumen

Permite que un usuario **siga** a un autor y lo **deje de seguir**, con un botón que responde al instante. Hoy el seguimiento **no cambia el feed** (es global): solo alimenta el botón "Seguir/Siguiendo" y el contador de seguidores del perfil. Está construido para que, más adelante, se pueda armar un feed "solo de a quienes sigo".

## Qué necesitás entender antes

- [ ] **Server Action** (`"use server"`): función del servidor que el botón llama directamente.
- [ ] `useTransition` y `useOptimistic` de React: actualizar la pantalla *antes* de que el servidor responda, y revertir si falla.
- [ ] Qué es **idempotente**: hacer la acción dos veces produce el mismo resultado que una.
- [ ] Qué es una restricción `UNIQUE` y un `CHECK` en una tabla SQL.
- [ ] RLS a nivel básico: reglas de la base sobre quién puede insertar/borrar filas ([PRD-2.1](PRD-2.1-posts-data-rls.md)).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `followAuthor` / `unfollowAuthor` y las consultas de seguimiento | Un feed "solo de quienes sigo" (decisión: no está; ver [ADR 0021](../adr/0021-feed-en-raiz-y-global.md)) |
| `FollowButton` en sus dos variantes | El perfil del autor y sus pestañas: [PRD-3.3](PRD-3.3-author-profile.md) |
| La tabla `subscriptions` (restricciones, índice, RLS) | La tabla `reading_history` (misma migración): [PRD-2.6](PRD-2.6-post-detail.md) y [PRD-4.1](PRD-4.1-scoring-core.md) |
| Nada de notificaciones ni lista de seguidores | Lista navegable de seguidores/seguidos (no existe) |

## Cómo funciona

Orden de lectura: `0003_feed.sql` (solo `subscriptions`) → `actions.ts` → `queries.ts` → `FollowButton.tsx`.

### 1. La tabla

`subscriptions(id, follower_id, author_id, created_at)`: quién sigue (`follower_id`) a quién (`author_id`). Reglas dentro de la base:

| Regla | Efecto |
| :--- | :--- |
| `UNIQUE (follower_id, author_id)` | No se puede seguir dos veces a la misma persona |
| `CHECK (follower_id <> author_id)` | Nadie puede seguirse a sí mismo (aunque el código lo evite antes) |
| RLS SELECT público | Cualquiera puede leer, para poder mostrar el contador |
| RLS INSERT `follower_id = auth.uid()` | Solo podés crear seguimientos **como vos mismo** |
| RLS DELETE `follower_id = auth.uid()` | Solo podés borrar **tus** seguimientos |
| Índice `subscriptions_author_id_idx` | Hace rápido contar los seguidores de un autor |

### 2. Las acciones (`actions.ts`)

```text
followAuthor(authorId):
  si authorId no es un uuid válido -> { ok: false }
  usuario = requireUser()              (sin sesión -> /login)
  si authorId == usuario.id -> { ok: false }        # autoseguimiento bloqueado
  upsert en subscriptions { follower_id, author_id } ignorando duplicados
  revalidatePath(/author/<authorId>)
unfollowAuthor(authorId):
  delete de la fila (follower_id = yo, author_id = authorId)
  revalidatePath(/author/<authorId>)
```

Dos ideas para entender: (a) el `upsert` con `ignoreDuplicates` hace que un **doble click** o un reintento no falle ni duplique; (b) el autoseguimiento se bloquea **dos veces**, en el código y en la base.

### 3. Las consultas (`queries.ts`)

| Función | Para qué |
| :--- | :--- |
| `isFollowing(followerId, authorId)` | ¿Ya lo sigo? (perfil del autor) |
| `getFollowedAuthorIds(followerId, authorIds)` | De estos autores, ¿a cuáles sigo? Una sola consulta para pintar el botón en toda una página de posts (feed) |
| `getFollowerCount(authorId)` | Cuántos seguidores tiene (usa `count` sin traer filas) |

Todas lanzan un `Error` en español si la base falla (las páginas lo muestran con `error.tsx`).

### 4. El botón (`FollowButton.tsx`)

Componente cliente con dos variantes: `"button"` (perfil: "Seguir" / "Dejar de seguir") y `"text"` (tarjetas del feed: "Seguir" / "Siguiendo"). Usa `useOptimistic`: al hacer click cambia el texto **al instante** y en segundo plano llama a la acción; si el servidor no responde bien, React vuelve al valor real. `isPending` deshabilita el botón mientras tanto.

Un **visitante sin sesión** no ve este botón: en `PostCard` ve un enlace "Seguir" que abre el `LoginDrawer` ([PRD-1.1](PRD-1.1-auth-forms.md)); en su propio perfil no se muestra nada.

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| Seguimiento idempotente + UI optimista | Un doble click no invierte el resultado y la UI responde al instante † |
| Autoseguimiento bloqueado en código **y** en la base | El código da un fallo controlado; el `CHECK` es la defensa si alguien llama a la base directamente |
| Contador público (RLS SELECT público) | Se puede mostrar a cualquiera sin funciones especiales |
| El seguimiento no afecta al feed | Un feed de seguidos exigiría decidir cómo mezclarlo con el resto; el motivo real **no quedó registrado** ([ADR 0021](../adr/0021-feed-en-raiz-y-global.md)) |

## Criterios de aceptación

- [ ] Seguir y dejar de seguir se refleja al instante en el botón.
- [ ] Pulsar "Seguir" dos veces seguidas no crea dos filas ni da error.
- [ ] Un autor no ve botón "Seguir" en su propio perfil ni en sus propias tarjetas.
- [ ] Un visitante sin sesión ve "Seguir" que abre el login, no un error.
- [ ] El contador de seguidores del perfil sube/baja tras seguir/dejar de seguir (al recargar).
- [ ] Un intento de seguirse a sí mismo (llamando la acción a mano) devuelve `{ ok: false }`.

## Cómo verificarla a mano

1. Corré `pnpm seed:dev` ([PRD-X.2](PRD-X.2-dev-tooling.md)) para tener varios usuarios, o registrá dos cuentas.
2. Con la cuenta A, abrí el perfil de B (`/author/<id de B>`) y pulsá "Seguir": el botón pasa a "Dejar de seguir" y el contador sube al recargar.
3. En el feed, en una tarjeta de B, el texto dice "Siguiendo".
4. Abrí tu propio perfil: no hay botón de seguir.
5. En una ventana privada (sin sesión), pulsá "Seguir" en una tarjeta: abre el login.
6. Los e2e de esto están en `e2e/feed.spec.ts` ("a reader follows and unfollows an author"). Algunos tests del archivo están desactualizados: ver [PRD-X.1](PRD-X.1-testing-e2e.md).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| `FollowButton` ignora el resultado de la acción: si devuelve `{ ok: false }` no avisa (React solo revierte lo optimista al terminar la transición). Mostrar un mensaje de error | B |
| Implementar la pestaña "Subscriptions" del perfil con los autores que sigo ([PRD-3.3](PRD-3.3-author-profile.md)): necesita una consulta nueva de "a quién sigo" | M |
| Hacer clickeable el contador de seguidores y listar los seguidores | M |
| Un feed "solo de quienes sigo" (cambio de producto: primero decidirlo y documentarlo en un ADR) | A |
| Tests unitarios de la validación (el uuid inválido y el autoseguimiento) extrayendo la lógica a una función pura | M |

## Preguntas de autoevaluación

1. ¿Qué significa que `followAuthor` sea idempotente y cómo se logra?
2. ¿Por qué el autoseguimiento se bloquea en dos lugares?
3. ¿Qué hace `useOptimistic` y qué ve el usuario si el servidor falla?
4. ¿Por qué `getFollowedAuthorIds` recibe una lista de autores en vez de llamarse una vez por tarjeta?
5. ¿Qué políticas RLS impiden que yo haga seguir a otra persona a un tercero?
6. Hoy, ¿qué cambia en el feed cuando sigo a alguien?
