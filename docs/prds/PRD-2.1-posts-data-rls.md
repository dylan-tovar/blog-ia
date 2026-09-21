# PRD-2.1 — Datos de posts y seguridad (RLS y privilegios por columna)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-2 — Posts](PRD-2-posts.md) |
| Dificultad / Esfuerzo | A (avanzada) / L (más de 3 días) |
| Dueño sugerido / Mentor | D1 / — |
| Depende de | [PRD-1.2](PRD-1.2-auth-security.md) (quién es "el usuario" en cada consulta) |
| Alimenta a | [PRD-2.3](PRD-2.3-autosave-drafts.md), [PRD-2.4](PRD-2.4-publish-dialog-tags.md), [PRD-2.5](PRD-2.5-my-posts-page.md), [PRD-2.6](PRD-2.6-post-detail.md), [PRD-5.3](PRD-5.3-publish-moderation.md), [PRD-7.1](PRD-7.1-post-types-db.md) |
| Código | `supabase/migrations/0002_posts.sql`, `supabase/migrations/0007_ai_features.sql` (partes 1, 3 y 4), `src/features/posts/queries.ts` (`getOwnPost`, `getOwnPosts`, `getPublishedPost`), `src/lib/supabase/database.types.ts` |
| ADRs | [0003](../adr/0003-seguridad-rls-y-proxy-minimo.md), [0012](../adr/0012-integridad-de-escritura-de-posts.md) |

## Resumen

Es el "piso" sobre el que se apoya todo lo demás: las tablas `posts`, `tags` y `post_tags`, y **quién puede leer y escribir qué**. La regla central es que un artículo no publicado lo ve solo su autor y que **el navegador nunca puede cambiar `status`, `published_at` ni las columnas de IA**: solo el servidor. Si esta pieza falla, cualquier usuario podría publicar saltándose la moderación.

## Qué necesitás entender antes

- [ ] Qué es una fila y una tabla relacional, y qué es una clave foránea (`author_id → profiles.id`).
- [ ] **RLS** (*Row Level Security*): reglas dentro de la base que filtran **filas** según quién consulta (`auth.uid()`).
- [ ] La diferencia entre privilegio de **fila** (RLS) y de **columna** (`GRANT UPDATE (title, content)`). Es el corazón de este paquete.
- [ ] Qué es un *trigger* (código que la base ejecuta sola antes/después de un `UPDATE`).
- [ ] Las tres "llaves" de Supabase: `anon`/publishable (navegador, sujeta a RLS), sesión del usuario (`authenticated`) y `service_role`/secret (servidor, salta RLS). Ver [PRD-1.2](PRD-1.2-auth-security.md).
- [ ] Glosario general: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Tablas `posts`, `tags`, `post_tags` y sus políticas RLS | Columnas y reglas propias de las notas (`type`, `parent_post_id`, `can_attach_note`): [PRD-7.1](PRD-7.1-post-types-db.md) |
| Privilegios por columna, trigger de `updated_at` e invalidación de la caché de IA (0007, partes 1, 3 y 4) | La tabla `ai_rate_limits` y su función (0007, partes 5 y 6): [PRD-5.2](PRD-5.2-rate-limit.md) |
| Las tres consultas de lectura de un post: `getOwnPost`, `getOwnPosts`, `getPublishedPost` | Consultas del feed y del perfil (`getFeedPage`, `getPublishedPostsByAuthor`...): [PRD-3.2](PRD-3.2-feed-list.md) y [PRD-3.3](PRD-3.3-author-profile.md) |

## Cómo funciona

Orden de lectura sugerido: `0002_posts.sql` → `0007_ai_features.sql` → `queries.ts`.

### 1. Las tablas (`0002_posts.sql`)

| Tabla | Idea | Detalle que importa |
| :--- | :--- | :--- |
| `posts` | Un artículo (o, desde el PRD-7, una nota) | `status` es texto con un `CHECK`: `draft`, `pending_review`, `published`, `rejected`. `content` es `not null default ''` |
| `tags` | Catálogo de temas | `name` es `unique`: un mismo tag se reutiliza |
| `post_tags` | Une posts con tags (muchos a muchos) | Clave primaria compuesta `(post_id, tag_id)`; `on delete cascade` |

### 2. Filas: RLS (`0002` + ajustes posteriores)

| Acción | Regla vigente |
| :--- | :--- |
| Leer `posts` | `status = 'published'` **o** `author_id = auth.uid()`: un borrador solo lo ve su dueño |
| Insertar `posts` | `author_id = auth.uid()`, y (`type = 'note'` o `status = 'draft'`): un artículo **solo puede nacer borrador** (0007, parte 4) |
| Actualizar `posts` | Solo el dueño (política reescrita en `0005` y `0006`; ver [PRD-7.1](PRD-7.1-post-types-db.md)) |
| Borrar `posts` | Solo el dueño |
| `tags` | Todos leen; cualquier usuario autenticado puede crear; **no hay política de UPDATE** |
| `post_tags` | Se leen si el post es público o propio; insertar/borrar solo el dueño del post (y, desde `0005`, solo sobre artículos) |

> ¿Por qué "no hay UPDATE en `tags`" importa? Porque un `upsert` corriente intenta un `UPDATE` cuando el tag existe y RLS lo rechaza. Por eso `attachTag` usa `ignoreDuplicates` (`ON CONFLICT DO NOTHING`). Lo verás en [PRD-2.4](PRD-2.4-publish-dialog-tags.md).

### 3. Columnas: privilegios (`0007`, parte 3)

RLS decide **qué filas**, no **qué columnas**. Con la clave pública, un autor podía hacer `update posts set status = 'published'` sobre su propia fila y saltarse la moderación. La solución:

```sql
revoke insert, update on public.posts from anon, authenticated;
grant insert (author_id, type, title, content, status, published_at, parent_post_id) on public.posts to authenticated;
grant update (title, content) on public.posts to authenticated;
```

Resultado: el navegador solo puede **actualizar `title` y `content`**. `status`, `published_at`, `rejection_reason`, `updated_at` y `ai_*` los escribe únicamente el servidor con la secret key (`createAdminClient`, ver `publishPost` en [PRD-5.3](PRD-5.3-publish-moderation.md)).

> Detalle honesto: el `INSERT` sí concede `status` y `published_at` porque las notas nacen `published`. Lo que impide publicar un **artículo** en el insert es la política de la parte 4 (`type = 'note' or status = 'draft'`).

### 4. El trigger de `updated_at` (`0007`, parte 1)

`posts_invalidate_ai_cache` corre **antes de cada UPDATE**: si `content` cambió, anula `ai_generated_summary`, `ai_generated_titles` y `content_score` y pone `updated_at = now()`. Consecuencias:

- `updated_at` significa **"fecha del último cambio de contenido"** (cambiar solo el título **no** la mueve).
- Sirve de **versión** del texto: la reserva de publicación ([PRD-5.3](PRD-5.3-publish-moderation.md)) y la caché de IA ([PRD-5.4](PRD-5.4-ai-route-runner.md)) comparan `updated_at` para saber si el texto cambió.
- El cliente no puede falsearla: `updated_at` no está en la lista del `GRANT UPDATE`.

### 5. Las consultas (`queries.ts`)

| Función | Qué hace | Fallo |
| :--- | :--- | :--- |
| `getOwnPost(id)` | Un artículo propio con sus tags. Filtra por `author_id` **y** `type = 'article'` | id inválido, ajeno o inexistente → `notFound()` (404); sin sesión → `/login` |
| `getOwnPosts()` | Todos los artículos propios, por `updated_at` descendente | Además **borra** los borradores completamente vacíos (ver [PRD-2.5](PRD-2.5-my-posts-page.md)) |
| `getPublishedPost(id)` | Un post `published` con autor, likes, notas y `wordCount` | No publicado → 404 (también para su autor) |

`database.types.ts` se mantiene **a mano** ([ADR 0016](../adr/0016-migraciones-sql-manuales.md)): si cambiás una tabla, actualizalo vos.

## Decisiones y por qué

| Decisión | Por qué | Fuente |
| :--- | :--- | :--- |
| Privilegios por columna además de RLS | RLS solo protege filas; sin esto un autor podía auto-publicar | [ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md) |
| `updated_at` movido solo por trigger y solo por cambio de `content` | Es una versión confiable del texto para los compare-and-set | Comentario en `0007` |
| El artículo solo nace borrador (política de INSERT) | Cierra el otro camino para publicar sin moderar | Comentario en `0007` |
| Lectura de un no publicado → 404 incluso para su autor | Un solo criterio para "esto no es público"; el autor ve su borrador en el editor † | El motivo de este detalle no quedó registrado |

## Criterios de aceptación

- [ ] Un usuario ajeno no puede leer un borrador ni por URL ni por consulta directa.
- [ ] Un cliente con la clave pública recibe error al hacer `update posts set status = 'published'`.
- [ ] Cambiar solo el título no modifica `updated_at`; cambiar el contenido sí y anula la caché de IA.
- [ ] Insertar un artículo con `status = 'published'` desde el cliente es rechazado por RLS.
- [ ] `getOwnPost` de un post ajeno devuelve 404.

## Cómo verificarla a mano

1. Levantá el proyecto y las migraciones siguiendo [getting-started](../guides/getting-started.md).
2. Corré `pnpm seed:dev` y luego `pnpm verify:writes`: el script intenta escribir columnas reservadas con el cliente del navegador y debe ver los rechazos ([PRD-X.2](PRD-X.2-dev-tooling.md)).
3. En el SQL Editor de Supabase, `select * from posts where status = 'draft'`: como administrador ves todo; desde la app, otro usuario no.
4. Corré `pnpm test` y mirá `src/features/posts/schemas.test.ts` (qué campos descarta la validación de entrada).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Agregar un `CHECK` de longitud para `content` (hoy solo lo valida la aplicación con `POST_CONTENT_MAX_LENGTH`: una escritura directa podría pasar de 100 000 caracteres). Requiere una migración nueva, re-ejecutable | A |
| Actualizar `database.types.ts` con `ai_rate_limits` y `can_attach_note` (faltan hoy) | B |
| Documentar en un comentario de `0007` por qué `INSERT` concede `status`/`published_at` (ver nota de la sección 3) | B |

## Preguntas de autoevaluación

1. ¿Qué protege RLS y qué protegen los privilegios por columna? Dá un ejemplo que RLS sola no evita.
2. ¿Por qué `updated_at` no está en el `GRANT UPDATE`?
3. ¿Qué pasa con `ai_generated_summary` cuando el autor edita el texto? ¿Quién lo hace?
4. ¿Por qué un artículo no puede insertarse ya `published`, si el `INSERT` concede la columna `status`?
5. ¿Qué clave usa el servidor para escribir `status` y por qué el navegador jamás la ve?
