# 0023. Portada de artículos: imagen o texto sobre color, visible en el feed

- **Estado:** Aceptada
- **Fecha:** 2026-09-21
- **Fuentes:** `supabase/migrations/0009_post_cover.sql`, `src/features/posts/cover/`, `src/features/posts/components/PostCover.tsx`, `src/features/posts/components/ArticleCard.tsx`, `src/features/posts/components/editor/CoverPicker.tsx`, `src/features/posts/components/editor/PublishDialog.tsx`, `src/features/posts/actions.ts` (`savePostCover`)

## Contexto

Las tarjetas de artículo del feed eran solo texto (título y extracto). Con la subida de imágenes ([ADR 0022](0022-imagenes-en-supabase-storage.md)) se puede dar a cada artículo una portada que se vea en el feed: una imagen, o, si no hay imagen, un texto corto sobre un color elegido por el autor (una "tarjeta de cita").

## Decisión

Cada artículo tiene una portada opcional, con prioridad **imagen > texto sobre color > tarjeta sin portada** (el comportamiento anterior).

- **Datos:** tres columnas opcionales en `posts` (`0009`): `cover_image_url`, `cover_text` (1 a 200 caracteres) y `cover_color`. Restricciones `check` en la base: el color pertenece a una paleta cerrada, la URL de la imagen tiene que estar en la carpeta del propio autor (`/storage/v1/object/public/post-images/<author_id>/`) y solo los artículos pueden tener portada. No hay vistas ni RPC del feed que actualizar: el feed lee `posts` directamente.
- **Privilegios:** `0009` concede `update` por columna sobre las tres columnas a `authenticated` (ver [ADR 0012](0012-integridad-de-escritura-de-posts.md)). Sin ese `grant`, guardar la portada falla con `permission denied`. No se concede `insert`: la portada se elige al publicar, no al crear el borrador.
- **Paleta cerrada de 8 colores oscuros con texto blanco** (`slate`, `olive`, `wine`, `forest`, `navy`, `plum`, `rust`, `teal`): el contraste queda garantizado, el `check` es trivial y no hay selector de color libre. La lista vive en `cover-palette.ts` y en `0009`; hay que cambiar ambos a la vez.
- **Elección en el diálogo de publicar** (`CoverPicker`): "Sin portada", "Imagen" (subir una nueva con el mismo compresor de [ADR 0022](0022-imagenes-en-supabase-storage.md), o elegir una de las imágenes que ya están en el artículo, extraídas del markdown con `extractImageUrls`) o "Texto" (textarea de 200 caracteres y selector de color). Muestra una vista previa con el mismo componente que el feed (`PostCover`). El borrador del diálogo conserva lo escrito en el modo que no está activo; solo el modo activo llega a la base.
- **Escritura:** una acción propia `savePostCover`, con el cliente del usuario (no el admin). Valida con `createCoverSchema` (la imagen debe ser `isOwnCoverImage`: host de Supabase, bucket `post-images` y carpeta del usuario) y escribe las tres columnas. No toca `updated_at` (el trigger solo lo mueve cuando cambia `content`), así que no interfiere con el compare-and-set de `publishPost` y también sirve para artículos ya publicados. El diálogo la llama antes de publicar y con "Listo" o "Seguir editando" si hay cambios sin guardar.
- **Lectura:** `queries.ts` incluye las columnas en `CARD_COLUMNS` y `POST_COLUMNS` y resuelve la portada en el servidor (`resolveCover`), de modo que `ArticleCard` recibe un valor ya validado y el cliente no necesita la URL de Supabase. La imagen se muestra con `<img>` perezoso, `aspect-video` y `object-cover`, y las dimensiones salen del nombre del archivo (sin saltos de layout). Una URL que no pase `isAllowedImageUrl` se ignora y se cae al texto o a la tarjeta plana.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Selector de color libre (hex) | Sin garantía de contraste con texto blanco, obliga a calcular la luminosidad y el `check` de la base queda débil |
| Guardar la portada dentro de `publishPost` | Esa acción es un compare-and-set delicado sobre `status` y `updated_at`; sumarle la portada la complica y no serviría para editar la portada de un artículo ya publicado |
| Guardar la portada con el autosave del contenido | Mezcla dos ciclos de vida (contenido que cambia a cada tecla y una elección puntual) y obliga a ampliar el borrador y sus tests |
| Tabla aparte `post_covers` | Un join más en cada consulta del feed para tres columnas que siempre se leen con el post |
| Derivar la portada automáticamente de la primera imagen | El autor pierde el control y los artículos sin imagen no tendrían ninguna opción |

## Consecuencias

- **A favor:** feed más visual sin costo (reutiliza el bucket y el compresor de `0008`); portada validada en tres capas (esquema, acción del servidor y `check` de la base); cambio aditivo: sin portada, todo se ve como antes.
- **En contra:**
  - La portada solo se muestra en el feed (`/`, Explorar y perfil de autor): no hay banner en la página del artículo ni en `RecommendedCard`.
  - La portada se guarda al publicar o al cerrar el diálogo con sus botones; cerrarlo con Escape o tocando el fondo no la guarda (queda en memoria mientras el editor siga abierto).
  - Si la imagen elegida se borra del bucket, la URL queda colgada y la tarjeta muestra el espacio vacío de la imagen (no hay limpieza de huérfanas, ver [ADR 0022](0022-imagenes-en-supabase-storage.md)).
  - Cambiar la paleta exige una migración nueva.
- **Cuándo revisar:** si se quiere mostrar la portada en la página del artículo o en recomendaciones, si se necesitan más colores o degradados, o si se agrega limpieza de imágenes huérfanas.
