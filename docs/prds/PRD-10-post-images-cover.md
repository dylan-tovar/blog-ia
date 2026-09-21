# PRD 10 - Imágenes de artículos y portada en el feed

| Campo | Valor |
| :--- | :--- |
| Estado | **Implementado con limitaciones.** Subir imágenes desde el editor (botón, arrastrar y pegar), verlas en el lector y elegir una portada (imagen o texto sobre color) que se muestra en las tarjetas del feed. Limitaciones: la portada no se modera con IA, no hay limpieza de imágenes huérfanas ni cuota por usuario, y la portada no aparece en la página del artículo (ver [Limitaciones conocidas y deuda](#limitaciones-conocidas-y-deuda)) |
| Dueño / implementador | D1 (Dylan). **Ya implementado**: no queda trabajo asignable pendiente en la construcción; los paquetes son material de estudio y de traspaso |
| Depende de | [PRD-2](PRD-2-posts.md) (editor y publicación), [PRD-3](PRD-3-feed-follows.md) (tarjetas del feed), [PRD-5](PRD-5-ai-author.md) (la moderación al publicar) |
| Migraciones | `0008_post_images.sql` (bucket `post-images` y sus políticas), `0009_post_cover.sql` (columnas `cover_*` de `posts`) |
| ADRs relacionados | [0022](../adr/0022-imagenes-en-supabase-storage.md), [0023](../adr/0023-portada-de-articulos.md), [0010](../adr/0010-editor-markdown.md), [0012](../adr/0012-integridad-de-escritura-de-posts.md), [0016](../adr/0016-migraciones-sql-manuales.md) |
| Código | `src/features/posts/images/`, `src/features/posts/cover/`, `src/features/posts/components/{PostCover,ArticleCard,ArticleCardView,MarkdownContent}.tsx`, `src/features/posts/components/editor/{EditorToolbar,use-article-editor,use-image-upload,CoverPicker,PublishDialog}.ts(x)`, `src/features/posts/{actions,queries}.ts`, `supabase/migrations/0008_post_images.sql`, `0009_post_cover.sql` |

## Paquetes de trabajo

Este PRD se reparte en dos paquetes ([reparto del equipo](../team/reparto-de-tareas.md)). Ambos los implementó D1; se documentan como los demás para que cualquiera pueda estudiarlos y presentarlos.

| Paquete | Qué cubre | Dificultad | Esfuerzo | Dueño / implementador |
| :--- | :--- | :--- | :--- | :--- |
| [PRD-10.1](PRD-10.1-post-images.md) | Bucket de Storage y RLS, compresión y subida en el navegador, botón, arrastrar y pegar, render seguro en el lector | A | L | D1 (implementado) |
| [PRD-10.2](PRD-10.2-post-cover.md) | Columnas de portada, selector en el diálogo de publicar, `savePostCover`, tarjeta del feed con imagen o texto sobre color | M | M | D1 (implementado) |

## Resumen

El editor no permitía subir imágenes y el lector descartaba las que hubiera en el markdown. Ahora un autor sube imágenes **sin costo** (Supabase Storage, plan gratuito), que se **comprimen en su navegador** antes de subirse, y las inserta en el artículo con un botón, arrastrando o pegando. Los lectores las ven solo si vienen de nuestro propio bucket. Encima de eso, cada artículo puede tener una **portada** que se ve en el feed: una imagen (subida o elegida entre las del artículo) o, si no hay imagen, un texto corto sobre un color de una paleta cerrada.

## Problema y objetivo

**Problema.** Un blog sin imágenes es poco atractivo y un feed de tarjetas solo de texto es monótono. Pero las imágenes traen tres riesgos: costo de almacenamiento y de tráfico (el plan gratuito de Supabase da 1 GB y unos 5 GB al mes), abuso (un usuario escribiendo en la carpeta de otro) y rastreo (un post que carga una imagen de un host ajeno espía a sus lectores).

**Objetivo.**

- Subir imágenes gratis y que el plan gratuito rinda: cada imagen sale en WebP de hasta 1600 px y pesa decenas o pocos cientos de KB.
- Que nadie pueda escribir ni borrar fuera de su carpeta, ni siquiera saltándose la interfaz.
- Que el lector solo cargue imágenes de nuestro bucket.
- Que el feed pueda mostrar una portada por artículo sin cambiar nada para los artículos que no la tengan.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Bucket público `post-images` con límite de 2 MB y tipos JPG, PNG y WebP; políticas por carpeta de usuario | Limpieza de imágenes huérfanas y cuota por usuario (ADR 0022) |
| Compresión y redimensionado en el navegador, subida con caché de un año | Varios tamaños por imagen o transformaciones del servidor (son de pago) |
| Botón "Imagen", arrastrar y pegar; texto alternativo por defecto | Interfaz para editar el texto alternativo |
| Render en el lector con allow-list de URL y dimensiones sin saltos de layout | Imágenes de hosts externos: no se cargan (se muestra su texto alternativo) |
| Portada (imagen, o texto y color) elegida al publicar y visible en el feed, Explorar y perfil de autor | Banner de portada en la página del artículo y en `RecommendedCard` |
| Validación de la propiedad de la imagen de portada en tres capas | Moderación con IA del texto de la portada (limitación conocida) |

## Cómo funciona

```mermaid
flowchart LR
  A[Autor: botón, arrastrar o pegar] --> B[Comprimir en el navegador<br/>WebP, máx. 1600 px]
  B --> C[(Storage: post-images/uid/uuid-WxH.webp)]
  C --> D[Editor: ![alt](url) en el markdown]
  D --> E[Lector: img solo si la URL es del bucket]
  C --> F[Diálogo de publicar: elegir portada]
  F --> G[savePostCover: valida y guarda cover_*]
  G --> H[Feed: ArticleCardView con la portada]
```

El detalle de cada mitad está en los paquetes: subida, seguridad y lector en [PRD-10.1](PRD-10.1-post-images.md); portada y tarjeta del feed en [PRD-10.2](PRD-10.2-post-cover.md).

### Capas de seguridad

| Capa | Qué impone | Dónde |
| :--- | :--- | :--- |
| Storage | Tamaño máximo 2 MB, solo `image/webp`, `image/jpeg` e `image/png`; escribir y borrar solo en `<uid>/…` | `0008_post_images.sql` |
| Base de datos | La URL de la portada tiene que apuntar a la carpeta del propio autor; solo los artículos tienen portada; color de una paleta cerrada | `0009_post_cover.sql` |
| Servidor | `savePostCover` valida con `createCoverSchema` (`isOwnCoverImage`) antes de escribir | `src/features/posts/actions.ts`, `cover/cover-schema.ts` |
| Lector y feed | Solo se renderiza una URL que pase `isAllowedImageUrl` (host de Supabase, ruta del bucket, sin credenciales ni `..`) | `images/image-utils.ts`, `MarkdownContent.tsx`, `cover/cover.ts` |

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Supabase Storage con compresión en el navegador** ([ADR 0022](../adr/0022-imagenes-en-supabase-storage.md)) | Cloudinary (otra cuenta y dependencia), transformaciones de Supabase (de pago), base64 en el markdown (hincha `posts.content`) | Costo cero y sin dependencias nuevas; la compresión corre en el hilo principal del autor |
| **`<img>` propio en vez de `next/image`** (ADR 0022) | El optimizador de Next | La imagen ya sale en WebP de hasta 1600 px; evita gastar cuota del hosting y la configuración de `remotePatterns` |
| **Allow-list de URL** en el lector y el feed (ADR 0022) | Permitir cualquier host | Un post no puede rastrear a sus lectores ni mostrar contenido ajeno |
| **Portada con paleta cerrada de 8 colores oscuros y texto blanco** ([ADR 0023](../adr/0023-portada-de-articulos.md)) | Selector de color libre | Contraste garantizado y `check` trivial en la base |
| **`savePostCover` como acción propia**, no dentro de `publishPost` (ADR 0023) | Guardarla dentro de `publishPost` o con el autoguardado | No toca el compare-and-set de la publicación y permite editar la portada de un artículo ya publicado |
| **Cuando la portada es de texto, toda la tarjeta usa el color** (ADR 0023) | Solo el bloque superior de color y el resto oscuro | Una superficie continua que muestra solo la cita y el título; sin extracto |

## Criterios de aceptación

- [ ] El botón "Imagen", arrastrar y pegar suben una imagen y la insertan en el artículo como `![alt](url)`.
- [ ] El archivo queda en `post-images/<uid>/<uuid>-<ancho>x<alto>.webp` y pesa 2 MB o menos.
- [ ] Pegar texto desde Word, Excel o Sheets pega el texto y no sube una captura.
- [ ] Un usuario no puede subir ni borrar en la carpeta de otro.
- [ ] El lector (incluso sin sesión) ve las imágenes del bucket con carga diferida; una imagen de otro host no se carga.
- [ ] Al publicar se puede elegir portada: imagen subida, imagen del artículo, o texto y color; o ninguna.
- [ ] El selector solo ofrece imágenes del propio autor.
- [ ] La portada se ve en `/`, en Explorar y en el perfil del autor; con imagen arriba y título y extracto debajo; con texto, toda la tarjeta toma el color y muestra cita y título.
- [ ] Un artículo sin portada se ve exactamente como antes.
- [ ] Una URL de portada de otro host o de la carpeta de otro usuario se rechaza (servidor y base).

## Limitaciones conocidas y deuda

| Limitación | Detalle |
| :--- | :--- |
| **`cover_text` no se modera con IA** | `publishPost` modera solo `posts.content`. El texto de la portada se guarda con `savePostCover`, que **no** llama a la moderación. Como `savePostCover` también sirve para artículos ya publicados, un autor puede cambiar ese texto después de publicar sin pasar por moderación. Cerrarlo obliga a moderar en ambos sitios con el mismo carril de límite de peticiones y a cambiar el tipo de resultado de `savePostCover` (puede quedar "ocupado" o "rechazado"), por eso no se hizo |
| Imágenes huérfanas | Si el autor borra una imagen del texto, el archivo queda en el bucket. Tampoco hay cuota por usuario |
| Portada colgada | Si la imagen elegida como portada se borrara del bucket, la tarjeta mostraría el hueco de la imagen |
| Posición al soltar varias imágenes | La posición de inserción no se reajusta si el documento cambia mientras se suben; los errores de varias subidas no se agregan (se muestra el último) |
| Cerrar el diálogo con Escape o el fondo | No guarda la portada; solo lo hacen "Listo", "Seguir editando" y "Publicar" |
| Alcance de la portada | Solo el feed (`/`, Explorar, perfil de autor). No hay banner en la página del artículo ni en `RecommendedCard` |
| Texto alternativo | Sale del nombre del archivo solo si es descriptivo; no hay interfaz para editarlo |
| Migraciones manuales | `0008` y `0009` se pegan a mano en el SQL Editor ([ADR 0016](../adr/0016-migraciones-sql-manuales.md)); no hay tabla de control |

## Pruebas

Solo lógica pura, con Vitest (entorno `node`; ver [guía de testing](../guides/testing.md)):

| Archivo | Qué cubre |
| :--- | :--- |
| `images/image-utils.test.ts` | Validación del archivo de origen, tamaño de destino, rutas, dimensiones en el nombre, allow-list de URL, texto alternativo por defecto y `shouldInterceptPaste` |
| `images/image-markdown.test.ts` | Ida y vuelta de `![alt](url)` en el markdown del editor (con `jsdom`) |
| `cover/cover.test.ts` | Paleta, `resolveCover`, `extractImageUrls`, `isOwnCoverImage` y `filterOwnCoverImages` |
| `cover/cover-schema.test.ts` | `createCoverSchema`: propiedad de la imagen, límite del texto, color por defecto |
| `cover/cover-draft.test.ts` | El borrador del selector: modos, conversión a valor y comparación |

**No se prueba con Vitest:** la compresión (`compress-image.ts`, necesita canvas y decodificación reales), la subida a Storage, los manejadores de arrastrar y pegar sobre ProseMirror, las políticas RLS y las restricciones de la base, y los componentes de interfaz. Se verifican a mano (ver la lista en cada paquete).
