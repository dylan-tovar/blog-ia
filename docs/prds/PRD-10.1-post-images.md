# PRD-10.1 — Imágenes de artículos: Storage, subida desde el editor y render seguro

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-10 — Imágenes de artículos y portada en el feed](PRD-10-post-images-cover.md) |
| Estado | **Implementado** |
| Dificultad / Esfuerzo | A (avanzada) / L (más de 3 días) |
| Dueño sugerido / Mentor | D1 (implementado) / — |
| Depende de | [PRD-2.2](PRD-2.2-editor-tiptap.md) (el editor Tiptap), [PRD-2.6](PRD-2.6-post-detail.md) (la página que muestra el artículo), [PRD-2.1](PRD-2.1-posts-data-rls.md) (RLS y privilegios como referencia) |
| Alimenta a | [PRD-10.2](PRD-10.2-post-cover.md) (usa el bucket, el compresor y la allow-list) |
| Migraciones | `0008_post_images.sql` |
| Código | `src/features/posts/images/` (`image-limits.ts`, `image-utils.ts`, `image-errors.ts`, `compress-image.ts`, `upload-post-image.ts`), `src/features/posts/components/editor/{use-image-upload,use-article-editor,EditorToolbar}.ts(x)`, `src/features/posts/components/MarkdownContent.tsx` |
| ADRs | [0022](../adr/0022-imagenes-en-supabase-storage.md), [0010](../adr/0010-editor-markdown.md), [0016](../adr/0016-migraciones-sql-manuales.md) |

## Resumen

Permite subir imágenes al artículo sin costo y verlas de forma segura. La imagen se valida, se redimensiona y se convierte a WebP **en el navegador del autor**, se sube a un bucket público de Supabase Storage dentro de su propia carpeta y se inserta en el markdown. El lector solo carga imágenes cuya URL pertenezca a ese bucket. Está implementado; este paquete sirve para estudiarlo y presentarlo.

## Qué necesitás entender antes

- [ ] Qué es **Supabase Storage**: buckets, objetos y la diferencia entre un bucket público (URL abierta, sin RLS al leer) y uno privado.
- [ ] Qué es **RLS** aplicado a `storage.objects` y por qué `storage.foldername(name)[1]` sirve para restringir por carpeta.
- [ ] Qué hace un **canvas** y qué es un `ImageBitmap`; qué es la orientación **EXIF** y por qué una foto de móvil puede salir girada.
- [ ] Qué es **WebP** y por qué comprime mejor que JPEG o PNG.
- [ ] Cómo maneja Tiptap el **arrastrar y pegar** (`handleDrop`, `handlePaste` en `editorProps`) y qué devuelve `true` o `false`.
- [ ] Por qué renderizar una imagen de un host ajeno es un problema de **privacidad** (rastreo por pixel).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Bucket `post-images`, políticas por carpeta, límites de tamaño y tipo | Limpieza de huérfanas, cuota por usuario ([ADR 0022](../adr/0022-imagenes-en-supabase-storage.md)) |
| Validación, redimensionado y codificación en el navegador | Varios tamaños por imagen y transformaciones del servidor (de pago) |
| Botón "Imagen", arrastrar y pegar; cola de subidas de a una | Recortar, rotar o editar la imagen |
| Texto alternativo por defecto | Interfaz para editar el texto alternativo |
| Render en el lector y en la vista previa con allow-list y dimensiones | Portada del feed: es [PRD-10.2](PRD-10.2-post-cover.md) |

## Cómo funciona

Orden de lectura sugerido: `0008_post_images.sql` → `image-limits.ts` → `image-utils.ts` → `image-errors.ts` → `compress-image.ts` → `upload-post-image.ts` → `use-image-upload.ts` → `use-article-editor.ts` y `EditorToolbar.tsx` → `MarkdownContent.tsx`.

### 1. Almacenamiento y permisos (`0008_post_images.sql`)

- Bucket público `post-images`, con límite de 2 MB y solo `image/webp`, `image/jpeg` e `image/png`. Los valida Storage, no solo el cliente.
- Los objetos viven en `<user_id>/<uuid>-<ancho>x<alto>.webp`. Las dimensiones en el nombre permiten reservar el espacio al renderizar.
- Las URLs públicas se sirven **sin pasar por RLS**, así que no hay política de SELECT abierta: nadie puede listar el bucket.
- Políticas de `storage.objects` solo para `authenticated` y solo en la carpeta propia (`(storage.foldername(name))[1] = auth.uid()::text`): INSERT, SELECT (Storage lo necesita para borrar) y DELETE. No hay política de UPDATE: el cliente sube con `upsert: false` y los nombres llevan UUID, así que un objeto nunca se reemplaza. La migración es re-ejecutable y retira la política de UPDATE de versiones anteriores.

### 2. Validación y compresión en el navegador

```text
uploadPostImage(file):
  validateSourceFile: tipo JPG/PNG/WebP, no vacío, máx. 10 MB de origen
  compressImage:
    leer el ancho natural con un <img> de sondeo (sin decodificar todo)
    createImageBitmap(file, { imageOrientation: "from-image",
                              resizeWidth 1600 si el ancho de origen lo supera })
    computeTargetSize: máx. 1600 px de ancho, nunca se amplía
    dibujar en un canvas y codificar WebP a calidad 0,8 (0,6 si sigue pesando > 2 MB)
    si el navegador no codifica WebP: JPEG con fondo blanco
    si aun así pesa > 2 MB -> error "too-large"
  obtener el usuario (auth.getUser); sin sesión -> error "auth"
  path = buildImagePath(user.id, randomUUID, ancho, alto)
  storage.upload(path, blob, { cacheControl: 1 año, upsert: false })
  devolver la URL pública
```

Los errores se modelan con `ImageUploadError` (códigos `type`, `empty`, `size`, `decode`, `too-large`, `auth`, `upload`) y `describeImageError` los convierte en mensajes en español para la interfaz.

### 3. Editor (`use-image-upload.ts`, `use-article-editor.ts`, `EditorToolbar.tsx`)

- **Botón "Imagen"** en la barra (input de archivos con `multiple`), **arrastrar y soltar** (`handleDrop`, que inserta en la posición donde se soltó) y **pegar** (`handlePaste`).
- `useImageUpload` procesa los archivos **de a uno**, en orden, con una cola de promesas: así varias imágenes soltadas juntas quedan ordenadas y el navegador nunca retiene más de un bitmap decodificado. Al terminar cada una inserta un nodo `image` con `src` y el texto alternativo.
- **Pegar:** `shouldInterceptPaste` solo intercepta si el portapapeles trae una imagen **y ningún** `text/plain` ni `text/html`. Word, Excel y Google Sheets adjuntan una captura PNG junto al texto real; ahí gana el texto.
- **Texto alternativo** (`defaultAltText`): sale del nombre del archivo solo si es descriptivo; los nombres de cámara o captura (`IMG_1234`, `Screenshot…`) dan alt vacío.
- El estado ("Subiendo imagen…") y los errores se muestran en línea, con el patrón `role="alert"` del resto del editor.

### 4. Lector (`MarkdownContent.tsx`)

`MarkdownContent` antes descartaba `img`; ahora tiene un componente `img` propio:

```text
si la URL no pasa isAllowedImageUrl(src, NEXT_PUBLIC_SUPABASE_URL):
    no se carga; se muestra el texto alternativo como texto plano (o nada si no hay)
si pasa:
    <img loading="lazy" decoding="async" width/height (parseImageSize) class="h-auto max-w-full">
```

`isAllowedImageUrl` exige `http(s)`, sin usuario ni contraseña en la URL, el mismo origen que `NEXT_PUBLIC_SUPABASE_URL`, una ruta que empiece por `/storage/v1/object/public/post-images/` y sin `..`. El mismo componente sirve al artículo, a la vista previa del editor y a las notas.

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| Comprimir en el navegador antes de subir | Subir el original y transformar en el servidor (de pago) | El 1 GB gratuito rinde; el costo de CPU lo paga el dispositivo del autor |
| `<img>` propio, no `next/image` | Optimizador de Next | Evita gastar la cuota del hosting; la imagen ya es WebP de ≤ 1600 px |
| Sin política de SELECT abierta ni de UPDATE | Bucket con lectura y escritura abiertas | Nadie lista el bucket ni reemplaza objetos (mínimo privilegio) |
| Nombre con UUID, `upsert: false`, caché de un año | Nombre por contenido o por usuario | Un objeto nunca cambia, así que se puede cachear "para siempre" |
| Subir de a uno | Todas en paralelo | Orden estable y un solo bitmap en memoria |
| Interceptar el pegado solo si no hay texto | Interceptar siempre que haya imagen | No se pierde el texto de Word, Excel o Sheets |
| Allow-list de URL en el lector | Permitir cualquier host | Sin rastreo de lectores ni contenido ajeno |

## Criterios de aceptación

- [ ] "Imagen", arrastrar y pegar suben la imagen y la insertan como `![alt](url)`.
- [ ] Una imagen de 4000 px sale de 1600 px de ancho como máximo y pesa 2 MB o menos.
- [ ] Un archivo que no es JPG, PNG o WebP, o de más de 10 MB, muestra un error legible y no se sube.
- [ ] Varias imágenes soltadas juntas quedan en orden.
- [ ] Pegar una tabla desde Excel o Sheets pega el texto, no una captura.
- [ ] Un usuario autenticado no puede subir ni borrar en la carpeta de otro (la política lo rechaza).
- [ ] Sin sesión, el lector ve las imágenes del bucket con carga diferida; una imagen de otro host no se carga y se muestra su texto alternativo.
- [ ] La migración `0008` se puede pegar dos veces sin error.

## Cómo verificarla a mano

1. Aplicá `supabase/migrations/0008_post_images.sql` en el SQL Editor y `pnpm dev`; abrí el editor.
2. Subí una imagen con el botón, otra arrastrándola y otra pegándola (copiá una imagen desde otra página). Confirmá en Supabase → Storage → `post-images` → tu carpeta que el archivo es `.webp` de 2 MB o menos.
3. Probá una imagen enorme y un PDF renombrado a `.png`: deben dar un error claro.
4. Copiá una tabla de Excel o Sheets y pegala: debe pegar texto.
5. Publicá el artículo y abrilo en una ventana privada: la imagen se ve.
6. En el markdown escribí `![x](https://example.com/a.png)`: no se carga y aparece "x".
7. Intentá subir a la carpeta de otro usuario (por ejemplo con `supabase.storage` desde la consola con otro `uid` en la ruta): la política debe rechazarlo.
8. Corré `pnpm test`: pasan `image-utils.test.ts` e `image-markdown.test.ts`.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Limpiar imágenes huérfanas (las que el autor quitó del texto siguen en el bucket) y agregar una cuota por usuario | A |
| Interfaz para editar el texto alternativo de una imagen ya insertada | M |
| Reajustar la posición de inserción si el documento cambia mientras se sube, y agregar los errores de varias subidas en un solo mensaje | M |
| Sacar la compresión del hilo principal (`OffscreenCanvas` en un Web Worker) | M |
| Extraer de `compress-image.ts` la elección de calidad y formato a una función pura para probarla sin canvas | B |

## Preguntas de autoevaluación

1. ¿Por qué no hay política de SELECT abierta y aun así los lectores ven las imágenes?
2. ¿Por qué no hay política de UPDATE y qué dos decisiones del cliente lo hacen innecesario?
3. ¿Para qué se lee el ancho con un `<img>` de sondeo antes de `createImageBitmap`?
4. ¿Qué haría un `text/html` con una imagen adjunta si `handlePaste` interceptara siempre?
5. ¿Qué riesgo concreto evita la allow-list de `isAllowedImageUrl` y por qué se rechazan las URLs con usuario y contraseña?
6. ¿Por qué las dimensiones van en el nombre del archivo y qué pasa con el layout si faltan?
