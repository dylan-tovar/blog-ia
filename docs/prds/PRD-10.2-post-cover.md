# PRD-10.2 — Portada del artículo en el feed (imagen o texto sobre color)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-10 — Imágenes de artículos y portada en el feed](PRD-10-post-images-cover.md) |
| Estado | **Implementado con limitaciones** (el texto de la portada no se modera con IA) |
| Dificultad / Esfuerzo | M (media) / M (1 a 3 días) |
| Dueño sugerido / Mentor | D1 (implementado) / — |
| Depende de | [PRD-10.1](PRD-10.1-post-images.md) (bucket, compresor y allow-list), [PRD-2.4](PRD-2.4-publish-dialog-tags.md) (el diálogo de publicar), [PRD-3.2](PRD-3.2-feed-list.md) (las tarjetas del feed), [PRD-2.1](PRD-2.1-posts-data-rls.md) (privilegios por columna) |
| Migraciones | `0009_post_cover.sql` |
| Código | `src/features/posts/cover/` (`cover.ts`, `cover-palette.ts`, `cover-schema.ts`, `cover-draft.ts`), `src/features/posts/components/{PostCover,ArticleCard,ArticleCardView}.tsx`, `src/features/posts/components/editor/{CoverPicker,PublishDialog}.tsx`, `src/features/posts/actions.ts` (`savePostCover`), `src/features/posts/queries.ts`, `src/app/(editor)/editor/[id]/page.tsx` |
| ADRs | [0023](../adr/0023-portada-de-articulos.md), [0022](../adr/0022-imagenes-en-supabase-storage.md), [0012](../adr/0012-integridad-de-escritura-de-posts.md) |

## Resumen

Un artículo puede tener una portada que se muestra en su tarjeta del feed. Es **una imagen** (subida en el momento o elegida entre las que ya están en el artículo) o, si no hay imagen, **un texto corto sobre un color** de una paleta cerrada. Prioridad: imagen, luego texto, luego la tarjeta de siempre. Se elige en el diálogo de publicar y se guarda con una acción propia, `savePostCover`. Está implementado; este paquete sirve para estudiarlo y presentarlo.

## Qué necesitás entender antes

- [ ] Qué es un **privilegio por columna** (`grant update (col) on table`) y por qué una columna nueva falla con `permission denied` si no se concede ([ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md)).
- [ ] Qué es una **restricción `check`** y por qué la propiedad de la imagen se comprueba con `like` sobre `author_id` en la misma fila.
- [ ] Qué es una **Server Action** y por qué la validación del servidor no puede confiar en el formulario.
- [ ] Qué es un **transform de Zod** y cómo `superRefine` agrega errores por campo.
- [ ] Cómo arma el feed sus tarjetas ([PRD-3.2](PRD-3.2-feed-list.md)): `CARD_COLUMNS`, `toFeedPost`, `ArticleCard`.
- [ ] Qué es un componente de presentación compartido (`ArticleCardView`) y por qué evita que la vista previa y el feed se desincronicen.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Columnas `cover_image_url`, `cover_text` y `cover_color`, con sus `check` y su `grant update` | Banner de portada en la página del artículo y en `RecommendedCard` |
| Selector en el diálogo de publicar (sin portada, imagen o texto) con vista previa | Colores libres, degradados, fuentes o tamaños de texto |
| Acción `savePostCover` con validación de propiedad | Moderación con IA del texto de la portada (limitación conocida) |
| Tarjeta del feed con imagen o con texto sobre color, en `/`, Explorar y perfil de autor | Recorte o encuadre de la imagen: siempre `aspect-video` con `object-cover` |

## Cómo funciona

Orden de lectura sugerido: `0009_post_cover.sql` → `cover-palette.ts` → `cover.ts` → `cover-schema.ts` → `savePostCover` en `actions.ts` → `cover-draft.ts` → `CoverPicker.tsx` y `PublishDialog.tsx` → `queries.ts` (`toFeedPost`) → `PostCover.tsx`, `ArticleCardView.tsx` y `ArticleCard.tsx`.

### 1. Datos (`0009_post_cover.sql`)

Tres columnas opcionales en `posts`. Restricciones `check`:

| Restricción | Regla |
| :--- | :--- |
| `posts_cover_image_url_check` | Máximo 500 caracteres y la ruta contiene `/storage/v1/object/public/post-images/<author_id>/`: la imagen tiene que estar en la carpeta del propio autor |
| `posts_cover_text_check` | De 1 a 200 caracteres |
| `posts_cover_color_check` | Uno de `slate`, `olive`, `wine`, `forest`, `navy`, `plum`, `rust`, `teal` (la lista vive también en `cover-palette.ts`: se cambian a la vez) |
| `posts_cover_article_only_check` | Una nota tiene las tres columnas en `null` |

`grant update (cover_image_url, cover_text, cover_color) on public.posts to authenticated`. Sin ese `grant`, guardar la portada falla con `permission denied` (las columnas se conceden una por una desde `0007`). No se concede `insert`: la portada se elige al publicar, no al crear el borrador. La migración es re-ejecutable.

### 2. Resolver y validar (`src/features/posts/cover/`)

- `resolveCover({ imageUrl, text, color }, supabaseUrl)` devuelve `{ kind: "image" | "text" | "none" }`: la imagen gana si pasa `isAllowedImageUrl`; si no, el texto (recortado, con el color por defecto `slate` si falta o es desconocido); si no, `none`. Trae las dimensiones de la imagen del nombre del archivo.
- `isOwnCoverImage(url, supabaseUrl, userId)`: la URL pasa `isAllowedImageUrl` **y** su ruta empieza por `…/post-images/<userId>/`. Es la comprobación de propiedad. `filterOwnCoverImages` la aplica a una lista.
- `extractImageUrls(markdown, supabaseUrl)`: las imágenes del artículo (sin duplicados, en orden, ignorando código y URLs no permitidas).
- `createCoverSchema({ supabaseUrl, userId })`: Zod con `superRefine` (imagen propia, color de la paleta) y un `transform` que normaliza: texto recortado o `null`, y el color solo si hay texto.

### 3. Guardar (`savePostCover` en `actions.ts`)

```text
savePostCover(postId, input):
  validar postId (uuid)
  requireUser
  createCoverSchema({ supabaseUrl, userId: user.id }).safeParse(input)
    si falla -> { ok: false, error: primer mensaje }
  UPDATE posts SET cover_* WHERE id, author_id = usuario, type = article   (cliente del usuario)
    sin filas -> "No pudimos guardar la portada."
  revalidatePath("/"), ("/explore") y el perfil del autor
```

Usa el **cliente del usuario**, no el admin: sirve el `grant` por columna y RLS. No toca `updated_at` (el trigger solo lo mueve si cambia `content`), así que no interfiere con el compare-and-set de `publishPost` y también funciona sobre artículos ya publicados.

### 4. Elegir la portada (`CoverPicker.tsx`, `PublishDialog.tsx`, `cover-draft.ts`)

- El editor (`editor/[id]/page.tsx`) carga la portada actual con `getOwnPost` y pasa `initialCover` y el `userId` hasta el diálogo.
- El selector tiene tres modos: **Sin portada**, **Imagen** y **Texto**.
  - *Imagen:* subir una nueva (mismo compresor y subida de [PRD-10.1](PRD-10.1-post-images.md)) o elegir entre las miniaturas de las imágenes **propias** que ya están en el artículo (`extractImageUrls` + `filterOwnCoverImages`) y la portada actual.
  - *Texto:* textarea de 200 caracteres con contador y ocho colores.
- `CoverDraft` conserva lo escrito en el modo que no está activo (para poder volver); `draftToCoverValue` solo deja pasar el modo activo.
- Vista previa: para el texto, el mismo componente del feed (`ArticleCardView`) con el título del artículo; para la imagen, `PostCover` dentro de un borde.
- `PublishDialog` guarda la portada antes de publicar (`persistCover`, solo si cambió) y al cerrar con "Listo" o "Seguir editando". Mientras una imagen se sube, se deshabilitan Publicar, Listo, Seguir editando y el cierre con Escape o el fondo.

### 5. Mostrarla en el feed

`queries.ts` agrega las tres columnas a `CARD_COLUMNS` y `POST_COLUMNS` y resuelve la portada **en el servidor** (`resolveCover` dentro de `toFeedPost`), de modo que `ArticleCard` recibe un `cover` ya validado y el cliente no necesita la URL de Supabase.

| Portada | Tarjeta (`ArticleCardView`) |
| :--- | :--- |
| **Imagen** | Imagen arriba (`aspect-video`, `object-cover`, carga diferida, dimensiones del nombre) y debajo título y extracto de 2 líneas, sobre la superficie neutra de siempre |
| **Texto** | **Toda la tarjeta** toma el color de la paleta, con borde suave y texto blanco: comilla, texto en serif y el título debajo. **No** muestra el extracto |
| **Ninguna** | Exactamente la tarjeta anterior: título y extracto de 3 líneas |

La tarjeta entera sigue siendo un solo enlace al artículo (`ArticleCard`), con anillo de foco visible.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| Paleta cerrada de 8 colores oscuros con texto blanco | Selector hex libre | Contraste garantizado, `check` trivial, sin calcular luminosidad |
| Acción propia `savePostCover` | Dentro de `publishPost`; con el autoguardado | No complica el compare-and-set de publicar y permite editar la portada de un artículo ya publicado |
| Portada con cliente del usuario y `grant` por columna | Cliente admin | Sigue rigiendo RLS y el mínimo privilegio; hay que recordar el `grant` |
| Propiedad comprobada en tres capas (esquema, acción, `check`) | Confiar en la interfaz | Un cliente modificado no puede apuntar a la imagen de otro |
| Resolver la portada en el servidor | Pasar las columnas crudas al cliente | La tarjeta recibe un valor validado y el cliente no necesita la URL de Supabase |
| Texto: toda la tarjeta con el color, sin extracto | Solo el bloque superior de color y el resto oscuro | Una superficie continua y una cita legible; el extracto sobraba |
| `ArticleCardView` compartido entre el feed y la vista previa | Dos componentes | La vista previa no se desincroniza del feed |
| El borrador conserva el modo inactivo | Vaciarlo al cambiar de modo | Se puede probar entre imagen y texto sin perder lo escrito |

## Criterios de aceptación

- [ ] Con imagen subida, con imagen elegida del artículo, con texto y color, y sin portada, el artículo se publica y su tarjeta se ve como corresponde.
- [ ] El selector solo ofrece imágenes propias; una del artículo que sea de otro usuario no aparece.
- [ ] La portada se ve en `/`, `/explore` y el perfil del autor, en móvil y escritorio y en modo oscuro.
- [ ] Con texto, toda la tarjeta toma el color, muestra cita y título y no muestra el extracto; el resto de tarjetas no cambia.
- [ ] La vista previa del diálogo coincide con la tarjeta del feed.
- [ ] Se puede editar la portada de un artículo ya publicado y el feed se actualiza.
- [ ] Una URL de otro host o de la carpeta de otro usuario se rechaza en la acción y, si se intenta saltarla, en la base.
- [ ] Mientras se sube una imagen no se puede publicar ni cerrar el diálogo.
- [ ] La migración `0009` se puede pegar dos veces sin error.

## Cómo verificarla a mano

1. Aplicá `supabase/migrations/0009_post_cover.sql` en el SQL Editor (después de `0008`) y `pnpm dev`.
2. Creá un artículo con una imagen dentro, pulsá "Continuar", elegí "Imagen" y usá esa miniatura como portada; publicá y mirá `/`.
3. Repetí subiendo una imagen nueva desde el diálogo.
4. Repetí con "Texto": escribí una frase, probá los ocho colores y comprobá que la tarjeta entera toma el color y no hay extracto.
5. Publicá uno sin portada: debe verse como antes.
6. Editá la portada de un artículo ya publicado (desde el editor) y mirá que el feed cambie.
7. Probá 360 px, 768 px y escritorio, y el modo oscuro.
8. Rechazo en la base: desde la consola, `update posts set cover_image_url = '<URL de la carpeta de otro usuario>'` debe fallar por el `check`; y sin `grant`, fallaría con `permission denied`.
9. Corré `pnpm test`: pasan `cover.test.ts`, `cover-schema.test.ts` y `cover-draft.test.ts`.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| **Moderar `cover_text`**: hoy `publishPost` solo modera `content` y `savePostCover` no llama a la moderación. Hay que moderar en ambos sitios con el mismo carril de límite de peticiones y decidir cómo comunica `savePostCover` un "ocupado" o "rechazado" | A |
| Mostrar la portada como banner en la página del artículo y en `RecommendedCard` | M |
| Guardar la portada también al cerrar con Escape o el fondo (hoy solo con los botones) | B |
| Más colores, degradados o tamaños de texto (exige una migración nueva para el `check` de la paleta) | M |
| Qué mostrar si la imagen de portada ya no existe en el bucket (hoy queda el hueco) | M |

## Preguntas de autoevaluación

1. ¿Por qué guardar la portada falla con `permission denied` si se olvida el `grant update` en `0009`?
2. ¿Por qué `savePostCover` no usa el cliente admin y no toca `updated_at`?
3. ¿En qué tres capas se comprueba que la imagen de portada es del autor y por qué no basta con la interfaz?
4. ¿Por qué `cover_text` queda sin moderar aunque el contenido sí se modera, y qué habría que cambiar para cerrarlo?
5. ¿Qué garantiza `ArticleCardView` entre el feed y la vista previa?
6. ¿Por qué la portada se resuelve en el servidor en vez de enviar las columnas al cliente?
