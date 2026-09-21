# 0022. Imágenes de artículos en Supabase Storage, optimizadas en el navegador

- **Estado:** Aceptada
- **Fecha:** 2026-09-21
- **Fuentes:** `supabase/migrations/0008_post_images.sql`, `src/features/posts/images/`, `src/features/posts/components/editor/use-image-upload.ts`, `src/features/posts/components/MarkdownContent.tsx`

## Contexto

El editor no permitía subir imágenes ([ADR 0010](0010-editor-markdown.md) las dejó fuera de alcance) y los lectores no veían las que ya estuvieran en el markdown. Hace falta poder subirlas **sin costo** (plan gratuito de Supabase: 1 GB de almacenamiento y unos 5 GB de ancho de banda al mes) y renderizarlas sin abrir una superficie de rastreo ni de contenido ajeno.

## Decisión

Las imágenes se comprimen en el navegador, se guardan en un bucket público de Supabase Storage y se renderizan con un `<img>` propio, solo si la URL viene de ese bucket.

- **Almacenamiento:** bucket público `post-images` (`0008`), con límite de 2 MB y solo `image/webp`, `image/jpeg` e `image/png`; los valida Storage, no solo el cliente. Los objetos viven en `<user_id>/<uuid>-<ancho>x<alto>.webp`.
- **Permisos:** las URLs públicas se sirven sin pasar por RLS, así que no hay política de SELECT abierta (nadie puede listar el bucket). Subir, ver, reemplazar y borrar solo se permite a `authenticated` dentro de su propia carpeta (el primer segmento del path es `auth.uid()`). El SELECT acotado existe porque Storage lo necesita para borrar.
- **Optimización en el cliente:** se valida tipo y peso (máximo 10 MB de origen), se decodifica respetando la orientación EXIF, se reduce a 1600 px de ancho (nunca se amplía) y se codifica en WebP con calidad 0,8 (0,6 si aún pesa más de 2 MB; JPEG con fondo blanco si el navegador no codifica WebP). Se sube con `Cache-Control` de un año y sin `upsert`: el nombre lleva un UUID, así que un objeto nunca cambia.
- **Editor:** botón "Imagen" en la barra, arrastrar y soltar, y pegar. Se suben de a una, en orden. El texto alternativo sale del nombre del archivo solo si es descriptivo; los nombres de cámara o captura (`IMG_1234`, `Screenshot…`) dan alt vacío. El estado y los errores se muestran en línea, sin librería de toasts.
- **Lector:** `MarkdownContent` deja de descartar `img`, pero solo renderiza URLs `http(s)` del host de `NEXT_PUBLIC_SUPABASE_URL` cuyo path empieza por `/storage/v1/object/public/post-images/` (`isAllowedImageUrl`); cualquier otra no se muestra. Las dimensiones viajan en el nombre del archivo y se usan como `width` y `height` para reservar el espacio y evitar saltos de layout; `loading="lazy"` y `decoding="async"`.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| `next/image` con el optimizador de Next | La imagen ya sale en WebP de hasta 1600 px, así que el optimizador aporta poco y gasta la cuota de optimización del hosting. Además exige `remotePatterns`, y con Supabase local (IP `127.0.0.1`) `dangerouslyAllowLocalIP` |
| Transformaciones de imagen de Supabase | Son una función de pago |
| Cloudinary u otro servicio externo | Otra cuenta, otras credenciales y otra dependencia, para un problema que el plan gratuito de Supabase ya cubre |
| Base64 dentro del markdown | Hincha `posts.content` (límite de 100 000 caracteres) y la caché de IA; el editor ya lo rechaza (`allowBase64: false`) |
| Permitir imágenes de cualquier host | Deja que un post rastree a sus lectores o muestre contenido ajeno |

## Consecuencias

- **A favor:** costo cero, sin dependencias nuevas, imágenes de decenas o pocos cientos de KB, render seguro por allow-list y sin saltos de layout.
- **En contra:** la compresión corre en el navegador del autor (hilo principal, con un solo bitmap a la vez); no hay limpieza de imágenes huérfanas (si el autor borra la imagen del texto, el archivo queda en el bucket) ni cuota por usuario; el editor no tiene una interfaz para editar el texto alternativo.
- **Cuándo revisar:** al acercarse a 1 GB de almacenamiento o 5 GB de tráfico (limpieza de huérfanas, cuota por usuario o una CDN), o si se necesitan varios tamaños por imagen (entonces sí conviene el optimizador o un loader).
