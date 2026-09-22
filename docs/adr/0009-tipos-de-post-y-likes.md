# 0009. Tipos de post (nota y artículo) en una sola tabla, con las reglas en la base

- **Estado:** Aceptada. La cláusula "las notas son inmutables" fue reemplazada por [ADR 0015](0015-notas-editables.md) (reemplazada parcialmente).
- **Fecha:** 2026-09-19
- **Fuentes:** [PRD-7](../prds/PRD-7-notes-likes.md), `supabase/migrations/0005_post_types_and_likes.sql`

## Contexto

El PRD-7 divide "post" en `nota` (texto plano de hasta 500 caracteres, sin título ni tags, publicada al instante, opcionalmente dejada sobre otro post) y `artículo` (el post completo de PRD-2), y agrega `likes`. Notas y artículos comparten autor, feed y likes, y las funciones de IA de PRD-5/6 solo aplican a artículos.

## Decisión

Una sola tabla `posts` con `type` (`note` | `article`) y `parent_post_id` (auto-referencia, `on delete set null`), más una tabla `likes` con `unique (user_id, post_id)`. Las invariantes viven en la base (checks y RLS), no solo en las Server Actions: una nota es siempre `published`, sin título y de 1 a 500 caracteres; un artículo no tiene padre; una nota solo cuelga de un post publicado que no sea a su vez una respuesta; las notas son inmutables (UPDATE solo sobre `type = 'article'`); solo se da like a posts publicados.

Las notas se escriben en `NoteDialog`: un diálogo centrado desde `md` y de pantalla completa por debajo, con el teclado en pantalla respetado mediante `visualViewport`. Se abre desde el menú "Crear" (dropdown con Nota y Artículo), la barra "¿Qué estás pensando?" del feed y del perfil, y el botón "+" (en móvil abre la nota directo; en escritorio abre el menú). El compositor en línea `NoteComposer` queda solo para dejar notas sobre un post en `/post/[id]`.

En la aplicación: `setLike(postId, liked)` recibe el estado deseado (idempotente, seguro ante doble click); el conteo sale de `likes(count)` sin columna cacheada; `FeedPost` es una unión discriminada por `type`. Los artículos se crean con el flujo lazy de `/editor/new` (el menú "Crear" enlaza directo a esa ruta; ya no existe la action `createArticle`, porque `proxy.ts` ya redirige a `/login` sin sesión) y solo se editan en pantallas `md` o mayores: `DesktopOnly` no monta el editor por debajo de ese ancho. Eso es UX, no seguridad: el ancho de pantalla no se conoce en el servidor y RLS no puede distinguirlo.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Tablas `notes` y `articles` separadas | Duplica likes, feed y referencias de autor, o exige una tabla polimórfica para unificarlos |
| Validar solo en las actions | Una llamada directa a la API de Supabase saltaría las reglas; ADR 0003 ya delega la seguridad en la base |
| `likes_count` cacheado en `posts` | Exige triggers o lógica de sincronización que el volumen actual no justifica |
| Toggle de like (`toggleLike`) | No es idempotente: un doble click o un reintento invierten el resultado |
| Detectar móvil por user agent en el servidor | Frágil y no cubre tablets ni ventanas angostas; la media query es la fuente correcta |

## Consecuencias

- **A favor:** un solo feed y un solo sistema de likes; las reglas se cumplen aunque se salte la interfaz.
- **En contra:** columnas que quedan en `null` según el tipo (`title`); el límite de 500 caracteres queda `NOT VALID` para no rechazar las notas convertidas, así que las filas previas a `0005` pueden superarlo.
- **Cuándo revisar:** si el volumen de likes vuelve lento el conteo (cachear `likes_count`), o si se permiten hilos anidados o edición de notas.

## Actualización (2026-09-20)

La condición de revisión "edición de notas" se cumplió: la migración `0006` quitó la restricción de UPDATE a artículos y existe `updateNote`. Ver [ADR 0015](0015-notas-editables.md). Sigue vigente el resto: una sola tabla, invariantes en la base, likes idempotentes, `DesktopOnly`. El texto de arriba se conserva como registro de lo decidido entonces.

## Actualización (2026-09-22)

La otra condición de revisión, "hilos anidados", también se cumplió: ahora se puede responder a una respuesta. No se adoptó un árbol real — se mantiene `parent_post_id` siempre apuntando a la raíz (esta ADR sigue vigente en ese punto) y se agregó `reply_to_post_id`, un campo aparte solo de visualización. Ver [ADR 0029](0029-respuestas-a-respuestas.md).
