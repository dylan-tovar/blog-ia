# 0029. Responder a una respuesta con hilo plano, no árbol real

- **Estado:** Aceptada.
- **Fecha:** 2026-09-22
- **Fuentes:** [PRD-7.1](../prds/PRD-7.1-post-types-db.md), [PRD-7.2](../prds/PRD-7.2-notes-ui.md), `supabase/migrations/0013_note_reply_to.sql`, [ADR 0009](0009-tipos-de-post-y-likes.md)

## Contexto

El modelo de notas ([ADR 0009](0009-tipos-de-post-y-likes.md), `0005`) solo permitía un nivel de respuesta: `can_attach_note` exige que el post al que se le deja una nota tenga `parent_post_id is null`, así que una respuesta no podía a su vez recibir una respuesta. La interfaz no ofrecía ninguna acción para eso. `ADR 0009` había marcado "si se permiten hilos anidados" como un disparador explícito para revisarla.

## Decisión

Se permite responder a una respuesta, pero con un **hilo plano** (como Instagram/Twitter), no un árbol real: cualquier respuesta, sin importar a qué nivel responda, guarda en `parent_post_id` la **raíz** del hilo (el artículo o la nota original) — la invariante de `can_attach_note` no cambia. Se agrega `reply_to_post_id` (`0013`), un campo nuevo y separado que solo sirve para mostrar "En respuesta a X" con el autor inmediato; no participa del cálculo de la raíz ni de las políticas de anidamiento existentes.

Regla al publicar una respuesta a un post T: si T es un artículo, `parentPostId = T.id` y `replyToPostId` queda vacío (comportamiento sin cambios); si T es una nota, `parentPostId = T.parent.id` (la raíz que T ya tiene resuelta) y `replyToPostId = T.id`.

Se agrega `can_reply_to_note(reply_to_id, parent_id)`, función `SECURITY DEFINER` con el mismo patrón que `can_attach_note`, que exige que la nota referenciada esté publicada y pertenezca al mismo hilo (mismo `parent_post_id`) que la respuesta nueva.

En la interfaz, `PostCard` (feed, perfil de autor y lista de notas de un post) agrega un botón "Responder" a toda nota — no solo a artículos — que despliega un `NoteComposer` inline. `NoteItem` prioriza `replyTo` sobre `parent` para elegir a quién mostrar como "En respuesta a X".

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Árbol real (`parent_post_id` apunta al padre inmediato, profundidad ilimitada) | Exige sacar `can_attach_note` por completo, una consulta recursiva (CTE) para traer el hilo completo, e indentación recursiva en la UI. Mucha más superficie de bugs para un caso de uso que hoy es "quiero contestarle a alguien", no un foro anidado |
| Guardar solo `reply_to_post_id` y calcular la raíz en cada lectura (recorriendo hacia arriba) | Igual de costoso que el árbol real en las consultas de lectura, que son las más frecuentes (cada carga de feed) |
| Permitir responder solo desde la página propia de la respuesta (`/post/[id]`) | Obliga a navegar fuera del hilo para contestar; el caso de uso real (visto en el feed o en la lista de notas de un post) queda sin resolver |

## Consecuencias

- **A favor:** `getNotesCounts` y `getNotesForPost` (que ya filtran/cuentan por `parent_post_id` = raíz) siguen funcionando sin cambios — las respuestas de 2º nivel aparecen solas en la misma lista y en el mismo conteo. Sin CTE recursiva, sin cambios a `can_attach_note`.
- **En contra:** no hay una vista de "hilo" propiamente dicha — todas las respuestas de un post, sin importar a quién le respondan, se listan juntas y ordenadas por fecha. Alguien que responde a una respuesta de una respuesta (3er nivel en la práctica) sigue viendo su nota junto a las demás, ordenada por fecha, no anidada bajo su padre inmediato.
- **Cuándo revisar:** si se pide una vista de árbol real (indentación por nivel, colapsar hilos), habría que introducir `reply_to_post_id` como el verdadero padre y resolver la raíz de otra forma (o aceptar el costo de la CTE recursiva).
