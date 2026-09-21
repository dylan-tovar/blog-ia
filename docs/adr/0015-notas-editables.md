# 0015. Las notas son editables por su autor

- **Estado:** Aceptada. Reemplaza la cláusula "las notas son inmutables" de [ADR 0009](0009-tipos-de-post-y-likes.md); el resto de 0009 sigue vigente.
- **Fecha:** 2026-09-20 (escrito después de implementar; el cambio en sí ocurrió con la migración `0006`, cuyo único comentario es "Permite que los autores editen el contenido de sus propias notas")
- **Fuentes:** `supabase/migrations/0005_post_types_and_likes.sql`, `supabase/migrations/0006_allow_note_updates.sql`, `supabase/migrations/0007_ai_features.sql`, `src/features/posts/actions.ts` (`updateNote`), [PRD-7](../prds/PRD-7-notes-likes.md), [ADR 0012](0012-integridad-de-escritura-de-posts.md)

## Contexto

ADR 0009 decidió que una nota, una vez publicada, no se puede modificar: la política de UPDATE de `posts` exigía `type = 'article'`, y "edición de notas" figuraba como condición para revisar la decisión. La interfaz (`PostOptionsDrawer`) terminó ofreciendo "Editar nota", y sin cambiar la política eso era imposible. El motivo de producto no quedó registrado más allá de la migración.

## Decisión

Un autor puede editar el texto de sus propias notas.

- **Base de datos (`0006`):** la política "Users can update their own posts" pasa a `author_id = auth.uid()` (using y with check), sin la restricción a artículos.
- **Qué puede tocar el cliente:** lo limitan los privilegios por columna de `0007` ([ADR 0012](0012-integridad-de-escritura-de-posts.md)): solo `title` y `content`. `type`, `status`, `published_at`, `parent_post_id` y `updated_at` no se pueden modificar desde el navegador, así una nota no se convierte en artículo ni cambia de padre.
- **Invariantes que siguen valiendo:** las restricciones `posts_note_shape_check` (publicada, con fecha y sin título) y `posts_note_length_check` (1 a 500 caracteres) se evalúan en cada UPDATE, aunque esta última esté `NOT VALID` para las filas previas a `0005`.
- **Aplicación:** `updateNote(postId, content)` valida (no vacía, máximo 500 caracteres), actualiza con el cliente del usuario filtrando por `author_id` y `type = 'note'`, y revalida el feed, el perfil y la página del post (y la del padre, si es una respuesta). No hay respaldo con el cliente admin.
- **Sin historial ni marca de "editada":** la edición reemplaza el texto; el trigger de `0007` mueve `updated_at` cuando cambia `content`, pero la interfaz no lo muestra como edición.

## Alternativas consideradas

Las marcadas con † son razonamiento reconstruido a partir del código, no una discusión registrada.

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Mantener notas inmutables (borrar y volver a publicar) | Se decidió permitir la edición; el motivo de producto no está registrado |
| Política de UPDATE separada por tipo † | La restricción de columnas de `0007` ya impide cambiar `type`; una política extra duplicaría reglas |
| Guardar historial de versiones de la nota † | Una nota es texto corto de hasta 500 caracteres; el costo de una tabla de versiones no se justifica hoy |
| Editar con el cliente admin † | Saltaría RLS; ADR 0012 busca lo contrario (que el cliente admin quede para lo que el usuario no puede hacer) |

## Consecuencias

- **A favor:** corregir una nota no obliga a borrarla y perder sus likes y respuestas (las notas colgadas de otro post conservan su `parent_post_id`).
- **En contra:** el feed puede mostrar una nota distinta de la que otra persona vio o likeó, sin indicación de que fue editada. Las notas convertidas en `0005` pueden tener más de 500 caracteres y no se podrán guardar de nuevo sin acortarlas (el check aplica a toda fila modificada).
- **Cuándo revisar:** si hace falta una marca "editada" o historial, o si se agregan hilos anidados (habría que decidir qué pasa con las respuestas si el texto cambia).
