# 0016. Migraciones SQL manuales, sin Supabase CLI y con tipos escritos a mano

- **Estado:** Aceptada
- **Fecha:** 2026-09-20 (escrito después de implementar; refleja cómo se trabajó, no una discusión registrada)
- **Fuentes:** `supabase/migrations/` (`0001` a `0007`), `src/lib/supabase/database.types.ts`, [getting-started](../guides/getting-started.md), [db/README](../db/README.md)

## Contexto

El esquema vive en PostgreSQL de Supabase y cambió siete veces en pocos días (perfiles, posts, feed, username, tipos de post y likes, edición de notas, IA). Hace falta un modo de versionarlo y aplicarlo que no obligue a montar infraestructura local para un proyecto de un solo equipo.

## Decisión

Las migraciones son archivos SQL numerados a mano (`000N_nombre.sql`) que se **pegan y ejecutan en el SQL Editor** del dashboard de Supabase, en orden. Cada archivo lo dice en su cabecera ("Correr en el SQL Editor de Supabase").

- **Sin Supabase CLI.** No hay `supabase/config.toml`, ni base local, ni `supabase db push`. La carpeta `supabase/` solo contiene `migrations/` (y un `.temp/` de la CLI que no forma parte del flujo).
- **Sin tabla de control.** Nada registra qué migraciones se aplicaron en cada proyecto: quien las corre debe saberlo. Por eso las tres últimas se escribieron con `drop ... if exists` y `create or replace` (y `0005` protege su conversión de datos con una comprobación de que la columna `type` no exista), de modo que no fallan al repetirse. Ojo: **no equivale a poder repetirlas por separado**. `0005` recrea las políticas de INSERT y UPDATE de `posts` en su versión original, y `0006` y `0007` las redefinen después; correr `0005` sola sobre un proyecto ya migrado reabre la inserción de artículos ya publicados y rompe la edición de notas. Solo es seguro repetir la cadena `0005` → `0006` → `0007` completa y en orden, o `0007` sola si `0005` y `0006` ya están aplicadas. `0001` a `0004` **no** son repetibles: fallan, por ejemplo por una política o una restricción que ya existen.
- **Tipos escritos a mano.** `src/lib/supabase/database.types.ts` se mantiene a mano y hoy declara siete tablas y dos funciones (`ai_rate_limit_hit`, `login_email_for_username`). Le faltan la tabla `ai_rate_limits` (no se accede desde clientes con RLS) y la función `can_attach_note` (solo la usa una política). Una columna nueva en SQL no aparece en TypeScript hasta que alguien la agrega.
- **Datos de prueba y verificación fuera de SQL.** El seed y las comprobaciones son scripts de Node (`scripts/seed-dev.mjs`, `scripts/verify-post-writes.mjs`, `scripts/ai-smoke.mjs`), no SQL ni pruebas de base.
- **Seguridad en el mismo lugar.** Las políticas RLS, los privilegios por columna y las funciones `security definer` viven en estas migraciones ([ADR 0003](0003-seguridad-rls-y-proxy-minimo.md), [ADR 0012](0012-integridad-de-escritura-de-posts.md)), así que el SQL versionado es la fuente de verdad de los permisos.

## Alternativas consideradas

Las marcadas con † son razonamiento reconstruido a partir del código, no una discusión registrada.

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Supabase CLI con `db push` y migraciones con marca de tiempo † | Exige `config.toml`, Docker o enlace al proyecto y un flujo de credenciales que el proyecto no configuró; para un equipo pequeño se prefirió pegar el SQL |
| Generar tipos con `supabase gen types` † | Depende de la CLI; los tipos a mano bastaron mientras el esquema era chico |
| Un ORM con migraciones (Prisma, Drizzle) | Duplicaría el modelo que ya definen SQL y RLS, y RLS es la defensa real ([ADR 0003](0003-seguridad-rls-y-proxy-minimo.md)) |
| Editar el esquema desde el dashboard sin archivos † | No queda versionado ni revisable |

## Consecuencias

- **A favor:** cero herramientas nuevas; el SQL es legible y revisable en el repositorio; casi todos los archivos indican en su cabecera a qué PRD responden (`0004` y `0006` no).
- **En contra:** no hay forma automática de saber en qué estado está un proyecto de Supabase; `0001` a `0004` se aplican una sola vez; los tipos de TypeScript pueden desfasarse del SQL sin que nada avise; no hay base local ni pruebas de migraciones, así que la única verificación de escrituras es `pnpm verify:writes` contra un proyecto real. Un error a mitad de un script del SQL Editor puede dejar el esquema a medias.
- **Cuándo cambiar a Supabase CLI:** al sumar una segunda persona que aplique migraciones en paralelo, al tener más de un entorno (desarrollo, producción) o al necesitar pruebas de base en CI ([ADR 0018](0018-sin-ci-gates-manuales.md)). El primer paso sería agregar `supabase/config.toml`, renombrar las migraciones con marca de tiempo y generar los tipos con la CLI.
