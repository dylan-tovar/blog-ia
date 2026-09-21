# Base de datos

PostgreSQL gestionado por Supabase (Auth, RLS y PostgREST). El esquema vive en archivos SQL numerados en `supabase/migrations/` que se aplican **a mano** en el SQL Editor de Supabase ([ADR 0016](../adr/0016-migraciones-sql-manuales.md)). Los permisos (RLS, privilegios por columna, funciones `security definer`) están en esos mismos archivos: son la fuente de verdad de la seguridad ([ADR 0003](../adr/0003-seguridad-rls-y-proxy-minimo.md), [ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md)).

| Documento | Contenido |
| :--- | :--- |
| [schema.md](schema.md) | Tablas, columnas, restricciones, matriz de políticas RLS, funciones, diagrama de relaciones y tipos de TypeScript |

## Migraciones

| Orden | Archivo | Qué hace | ¿Se puede repetir? |
| :--- | :--- | :--- | :--- |
| 1 | `0001_profiles.sql` | `profiles` y RLS | No |
| 2 | `0002_posts.sql` | `posts`, `tags`, `post_tags` y RLS | No |
| 3 | `0003_feed.sql` | `subscriptions`, `reading_history`, índices y RLS | No |
| 4 | `0004_username.sql` | `profiles.username` y `login_email_for_username` | No |
| 5 | `0005_post_types_and_likes.sql` | Tipos de post, `parent_post_id`, restricciones, `can_attach_note`, `likes`. Convierte los posts de prueba existentes en notas la primera vez | Solo dentro de la cadena 0005 → 0006 → 0007 |
| 6 | `0006_allow_note_updates.sql` | Permite editar notas | Solo dentro de la cadena 0005 → 0006 → 0007 |
| 7 | `0007_ai_features.sql` | Caché de IA, trigger, privilegios por columna, `ai_rate_limits` y `ai_rate_limit_hit` | Sí, si `0005` y `0006` ya corrieron |
| 8 | `0008_post_images.sql` | Bucket público `post-images` de Storage y sus políticas sobre `storage.objects` ([ADR 0022](../adr/0022-imagenes-en-supabase-storage.md)) | Sí |

**`0005` nunca se repite sola.** Recrea la política de INSERT de `posts` sin la condición `type = 'note' or status = 'draft'` (que añade `0007`) y deja el UPDATE limitado a artículos (que abre `0006`). Corrida sola sobre un proyecto ya migrado, reabriría la inserción de artículos ya publicados sin moderación y rompería la edición de notas. Si hay que repetirla, se repite la cadena `0005` → `0006` → `0007`.

No hay tabla de control de migraciones: quien las aplica debe saber cuáles corrió. Para un proyecto nuevo, correr las ocho en orden. Para uno existente, correr solo las que falten, en orden; si `0007` cambió desde la última vez, se puede volver a correr sola (con `0005` y `0006` ya aplicadas). El procedimiento completo, con la verificación posterior, está en [getting-started](../guides/getting-started.md#migraciones).

## Comprobaciones

| Comando | Qué comprueba |
| :--- | :--- |
| `pnpm verify:writes` | Como un usuario sembrado, intenta escrituras prohibidas sobre `posts` (publicar directo, escribir columnas de IA) y las permitidas. Requiere `0007` y el seed |
| Llamar por RPC a `login_email_for_username` con la publishable key | Debe fallar con `permission denied` |

## Tipos de TypeScript

`src/lib/supabase/database.types.ts` se escribe **a mano**. Le faltan la tabla `ai_rate_limits` y la función `can_attach_note`. Si se cambia una columna en SQL, hay que reflejarla ahí (ver la sección al final de [schema.md](schema.md)).
