# 0012. Integridad de escritura de `posts`: privilegios por columna

- **Estado:** Aceptada
- **Fecha:** 2026-09-19
- **Fuentes:** `supabase/migrations/0006_allow_note_updates.sql`, `supabase/migrations/0007_ai_features.sql`, [ADR 0003](0003-seguridad-rls-y-proxy-minimo.md), [ADR 0011](0011-ia-con-gemini.md)

## Contexto

`0006` dejó la política UPDATE de `posts` en `author_id = auth.uid()` sin límite de columnas, y la política INSERT no miraba `status`. Con la anon key pública, cualquier autor podía hacer `update posts set status = 'published'` o insertar un artículo ya publicado. Con eso, la moderación de PRD-5 sería decorativa, y lo mismo valdría para `rejection_reason` y las columnas de caché de IA.

## Decisión

- **Privilegios por columna:** `0007` quita `insert` y `update` sobre `posts` a `anon` y `authenticated` y concede solo las columnas que el cliente usa: INSERT `author_id, type, title, content, status, published_at, parent_post_id`; UPDATE `title, content`. `updated_at` no se concede: lo mueve solo el trigger cuando cambia `content`, así que significa "fecha del último cambio de contenido" y sirve de versión para el caché de IA y la moderación (el cliente no puede falsearla). `status`, `published_at`, `rejection_reason` y `ai_*` los escribe solo el servidor con `service_role`.
- **INSERT solo como borrador:** la política exige que un artículo nazca `draft`. Las notas siguen naciendo publicadas (regla de `0005`).
- **Servidor:** `publishPost` verifica propiedad y tipo con el cliente del usuario y después cambia el estado con el cliente admin (siempre acotado por `author_id`). Las escrituras de caché de IA también usan el cliente admin. `updateNote` ya no tiene un respaldo con el cliente admin: solo el cliente del usuario, con `0006` y los privilegios por columna.
- **Seed y scripts:** `scripts/seed-dev.mjs` inserta los posts con el cliente admin (necesita `status = 'published'` y fechas). `pnpm verify:writes` ejercita cada ruta de escritura como usuario sembrado y confirma que el bypass quedó cerrado.
- **RLS sigue vigente:** los privilegios por columna se suman a las políticas; no las reemplazan.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Trigger que revierte cambios de `status` | Más código y más difícil de razonar que negar el privilegio |
| Política UPDATE con `with check` sobre `status` | RLS no distingue qué columna cambió sin consultar la fila anterior |
| Confiar en que la interfaz no lo ofrece | La API de Supabase es pública; la interfaz no es una frontera |

## Consecuencias

- **A favor:** la moderación y la caché de IA no se pueden saltar desde el navegador; el modelo de permisos queda explícito en la base.
- **En contra:** un escritor nuevo de `posts` desde el cliente necesita que se le conceda su columna, y si falta el error es `permission denied`. El cliente admin ya no se usa solo para el login por username.
- **Cuándo revisar:** al agregar columnas que el autor deba escribir, o al mover la publicación a una función SQL.
