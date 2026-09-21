# 0014. Aplicación de ediciones de la IA en el cliente, con fingerprints por bloque

- **Estado:** Aceptada
- **Fecha:** 2026-09-20 (escrito después de implementar; los motivos salen de los comentarios del código y de los tests, no de una discusión registrada)
- **Fuentes:** [PRD-8](../prds/PRD-8-ai-chat.md), [ADR 0013](0013-chat-ia-protocolo-ndjson-y-function-calling.md), `src/features/posts/components/editor/` (`editor-context.ts`, `apply-action.ts`, `action-overlap.ts`, `editor-bridge.ts`), `src/features/ai/components/chat/chat-state.ts`, `use-chat.ts`

## Contexto

El modelo propone cambios sobre un artículo que el autor **sigue editando** mientras la respuesta llega y mientras decide si la aplica. Una propuesta hecha para "el párrafo tercero" puede quedar apuntando a otra cosa, o a nada, si el autor escribe, borra o mueve texto. Aplicarla a ciegas corrompería el artículo; hacerlo en el servidor obligaría a persistir el borrador antes de cada aplicación.

## Decisión

Las ediciones se aplican **solo en el cliente**, sobre el documento vivo de Tiptap, y solo cuando el autor lo pide (botón "Aplicar", "Aplicar todo" o "Insertar en cursor").

- **Bloques e ids.** El documento se ve como una lista de nodos de primer nivel con id `b<índice del nodo>` (`docToBlocks`). Los nodos vacíos se omiten pero el índice se conserva, así los ids no se corren.
- **Snapshot por propuesta.** Al enviar el mensaje se toma un `EditorSnapshot` (título, bloques, selección, fingerprint del documento). Cada propuesta conserva **el snapshot con el que se hizo**: de ahí se juzga si sigue siendo aplicable.
- **Fingerprint por bloque.** `blockFingerprint` es un FNV-1a de 32 bits sobre `tipo`, `nivel` y `markdown`; **no incluye el id**, de modo que un bloque que solo se movió conserva su huella. Es una detección de cambios, no una frontera de seguridad. `docFingerprint` combina las huellas de todos los bloques.
- **Localización (`resolveAction`, pura y sin tocar el editor).** Busca en el documento vivo la misma **secuencia** de bloques que el modelo vio; si hay varias coincidencias, gana la más cercana a la posición original. Si el contenido ya no existe en ningún lado, la propuesta queda `stale` y no se toca nada. Las operaciones sobre selección comparan el texto seleccionado con el del snapshot; `append` no depende de ninguna huella (y reemplaza el párrafo vacío de un artículo vacío); `insert_at_selection` sin selección en el snapshot es el "insertar en cursor" manual y va exactamente donde está el cursor.
- **Límite de longitud.** `planApply` proyecta el largo del markdown resultante y rechaza (`too_long`) lo que supere el máximo del artículo (100 000 caracteres), diciendo por cuántos caracteres se pasa.
- **Un paso de historial.** `createEditorBridge.apply` cierra el historial de ProseMirror antes y después de insertar el markdown (`insertContentAt`, `contentType: 'markdown'`), así el cambio es un único paso de Ctrl+Z que no se mezcla con lo que el autor tipeó justo antes o después.
- **Deshacer acotado.** Cada aplicación guarda un token con el documento resultante y la profundidad del historial. "Deshacer" solo funciona si el documento sigue siendo exactamente ese y la profundidad no cambió; si el autor editó después, no se deshace desde la tarjeta (un Ctrl+Z revertiría lo último que el autor hizo, no el cambio de la IA) y se le explica.
- **Superposición.** `findOverlap` calcula la "huella" de cada propuesta: qué bloques **reemplaza** (`mutates`) y a cuáles solo **apunta** (`anchors`). Dos propuestas se superponen si una reemplaza lo que la otra reemplaza o a lo que la otra apunta. Dos inserciones después del mismo bloque no se superponen. La propuesta posterior queda marcada, se excluye de "Aplicar todo" y se libera si la anterior se descarta.
- **Estados de cada propuesta:** `pending`, `applied`, `discarded`, `stale`, `error`.
- **El servidor no participa en la aplicación.** Solo valida que cada acción apunte a bloques que el modelo vio ([ADR 0013](0013-chat-ia-protocolo-ndjson-y-function-calling.md)). El `fingerprint` del documento viaja en la petición y se valida con Zod, pero el servidor no lo usa (en el código de `src/features/ai` fuera de los tests solo aparece en `schemas.ts`); el motivo de que siga en el contrato no está registrado.

## Alternativas consideradas

Las marcadas con † son razonamiento reconstruido a partir del código, no una discusión registrada.

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Aplicar en el servidor y devolver el artículo nuevo † | Exige guardar el borrador antes y pelea con el autosave; el autor perdería lo que tipeó mientras tanto |
| Que el modelo devuelva el artículo completo † | Consume tokens de salida de más, arriesga alterar texto que no debía cambiar y no permite aplicar o descartar cambio por cambio |
| Posiciones numéricas (offsets) en vez de bloques † | Cualquier edición previa las corre; los bloques con huella toleran movimientos y solo fallan si el contenido desaparece |
| Comparar solo el fingerprint del documento entero | Cualquier tecla lo invalida aunque el bloque de interés no cambió; por bloque se conserva lo que sigue siendo válido |
| Hash criptográfico (SHA-256) † | Solo se detectan cambios accidentales, no hay adversario; FNV-1a es síncrono y trivial |
| Mutar el editor dentro de un updater de estado de React | Un re-render podría aplicar el cambio dos veces; `use-chat.ts` toca el editor fuera de cualquier updater |

## Consecuencias

- **A favor:** el autor siempre decide y ve el antes y el después; una propuesta desactualizada falla sin tocar el texto; cada cambio es un paso de Ctrl+Z; la lógica de resolución es pura y se prueba con Vitest sin navegador.
- **En contra:** el adaptador con Tiptap (`editor-bridge.ts`) necesita un ProseMirror real y solo lo cubre Playwright ([testing](../guides/testing.md)). Un FNV-1a de 32 bits puede colisionar (dos bloques distintos con la misma huella). Una propuesta sobre un bloque que el autor reescribió a mano queda `stale` y hay que pedirla de nuevo. El deshacer solo cubre el último paso propio.
- **Cuándo revisar:** si el editor pasa a colaboración en tiempo real (varios autores tocando el documento), si se necesita aplicar ediciones sin que la pestaña esté abierta, o si la tasa de propuestas `stale` justifica una relocalización más tolerante.
