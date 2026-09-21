# PRD-2.6 — Vista pública del post (`/post/[id]`)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-2 — Posts](PRD-2-posts.md) |
| Dificultad / Esfuerzo | B (básica) / S (hasta 1 día) |
| Dueño sugerido / Mentor | D10 / D2 |
| Depende de | [PRD-2.1](PRD-2.1-posts-data-rls.md) (`getPublishedPost`), [PRD-2.2](PRD-2.2-editor-tiptap.md) (`MarkdownContent`) |
| Se conecta con | [PRD-3.1](PRD-3.1-follow-system.md) (`ReadTracker` alimenta `reading_history`), [PRD-6.2](PRD-6.2-summary-ui.md) (botón de resumen), [PRD-7.2](PRD-7.2-notes-ui.md) (notas), [PRD-7.3](PRD-7.3-likes.md) (me gusta), [PRD-9.3](PRD-9.3-post-options-drawer.md) (menú de opciones) |
| Código | `src/app/(public)/post/[id]/page.tsx`, `src/features/posts/components/MarkdownContent.tsx`, `ReadTracker.tsx`, `getPublishedPost` en `src/features/posts/queries.ts`, `recordRead` en `actions.ts`, `src/lib/format.ts` (`formatRelativeDate`) |
| ADRs | [0009](../adr/0009-tipos-de-post-y-likes.md) |

## Resumen

Es la página donde **el lector** lee un artículo: título, autor, fecha, el texto renderizado, el botón de "me gusta", el resumen con IA (si el artículo es largo) y las notas de otros. La misma página también muestra una **nota** (texto corto) cuando el id es de una nota. Solo se ve un post **publicado**; cualquier otro caso (borrador, id inválido, id que no existe) da 404.

## Qué necesitás entender antes

- [ ] Rutas dinámicas de Next.js: `[id]` es un parámetro de la URL; `props.params` es una promesa (`await props.params`).
- [ ] Server Components `async` y `notFound()` (dispara la página 404).
- [ ] Qué es **markdown** y que se convierte en HTML para mostrarlo (librería `react-markdown`).
- [ ] Renderizado condicional en JSX (`cond && <Comp />`, `cond ? a : b`).
- [ ] Idea de **componentes cliente vs. servidor**: `ReadTracker` es cliente porque usa `useEffect`.
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Estructura de la página y qué muestra según sea artículo o nota | Cómo se genera el resumen: [PRD-6.1](PRD-6.1-summary-backend.md) / [PRD-6.2](PRD-6.2-summary-ui.md) |
| `MarkdownContent` (render seguro del markdown) | Escribir notas y sus reglas: [PRD-7.2](PRD-7.2-notes-ui.md) |
| `ReadTracker` y `recordRead` (registrar la lectura) | Cómo usa `reading_history` el motor de recomendaciones: [PRD-4.1](PRD-4.1-scoring-core.md) |
| Fecha relativa y manejo de 404 | El menú de opciones y sus acciones: [PRD-9.3](PRD-9.3-post-options-drawer.md) |

## Cómo funciona

Orden de lectura: `MarkdownContent.tsx` → `getPublishedPost` (en `queries.ts`) → `page.tsx` → `ReadTracker.tsx` + `recordRead`.

1. **Los datos.** `getPublishedPost(id)` valida que `id` sea un uuid (`idSchema`), pide el post con `status = 'published'` junto con su autor y la cuenta de likes y, si no hay resultado, llama a `notFound()`. Devuelve además `likeCount`, `viewerLiked`, `notesCount`, el post padre (si es una respuesta) y `wordCount` (solo para artículos, con `countWords`).
2. **La página.** `page.tsx` calcula banderas simples: `isNote`, `isReply` (nota con padre), `isOwn` (el visitante es el autor), `canDelete` (nota propia). Luego dibuja:

| Bloque | Cuándo | Paquete |
| :--- | :--- | :--- |
| `ReadTracker` | hay sesión **y** es un artículo | este |
| Título `<h1>` | artículos ("Sin título" si falta); en notas el `<h1>` es solo para lectores de pantalla | este |
| Autor + fecha (`formatRelativeDate`) + `PostOptionsDrawer` | siempre | [9.3](PRD-9.3-post-options-drawer.md) |
| "En respuesta a …" | si es una nota que responde a otro post | [7.2](PRD-7.2-notes-ui.md) |
| `SummaryButton` | artículo con `wordCount >= MIN_WORDS_SUMMARY` (300) | [6.2](PRD-6.2-summary-ui.md) |
| Contenido | nota: texto plano con saltos de línea; artículo: `MarkdownContent` | este |
| `LikeButton` y contador de notas | siempre (el contador de notas no aparece si es una respuesta) | [7.3](PRD-7.3-likes.md) |
| Sección "Notas" con `NoteComposer` o "Iniciá sesión" | si no es una respuesta | [7.2](PRD-7.2-notes-ui.md) |

3. **`MarkdownContent`.** Renderiza con `react-markdown` + `remark-gfm`. Reglas de seguridad: **no** se renderiza HTML crudo (no hay `rehype-raw`), **se descartan las imágenes** (`disallowedElements={["img"]}`), las URLs con protocolos peligrosos se limpian por defecto, las tablas van dentro de un contenedor desplazable y los enlaces externos llevan `target="_blank"` y `rel="noopener noreferrer nofollow"`.
4. **`ReadTracker`.** Es un componente cliente que no dibuja nada (`return null`): en un `useEffect` llama a la Server Action `recordRead(postId)`. `recordRead` hace un `upsert` en `reading_history` con `(user_id, post_id)`; releer solo actualiza `read_at`. Es de **mejor esfuerzo**: cualquier fallo se ignora y nunca afecta la lectura. Solo se registran **artículos** leídos con sesión iniciada.
5. **`maxDuration = 30`.** La página declara 30 segundos como tiempo máximo de ejecución: el resumen con IA puede tardar varios segundos.

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| Solo `published` es visible; un no publicado da 404, incluso para su autor | Un único criterio para "no es público"; el autor ve su borrador en el editor † (detalle no registrado) |
| Una sola página para artículos y notas | Comparten autor, fecha, likes y opciones; cambian título, contenido y notas ([ADR 0009](../adr/0009-tipos-de-post-y-likes.md)) |
| Sin HTML crudo ni imágenes en el render | Evita inyección de HTML/scripts en contenido escrito por otros; las imágenes no tienen soporte de subida |
| `recordRead` de mejor esfuerzo, solo artículos | Una falla secundaria no debe romper la lectura; las recomendaciones puntúan artículos por tags ([PRD-3](PRD-3-feed-follows.md), [PRD-4](PRD-4-recommendations.md)) |

## Criterios de aceptación

- [ ] `/post/<id publicado>` muestra título, autor, fecha relativa y el contenido renderizado.
- [ ] `/post/<borrador>`, `/post/<inexistente>` y `/post/abc` dan 404.
- [ ] Un enlace `[x](javascript:...)` en el markdown no es clickeable; un `<script>` o `<b>` escrito en el markdown **no se ejecuta ni se interpreta como HTML** (queda como texto o se omite).
- [ ] Un artículo con menos de 300 palabras no muestra el botón de resumen.
- [ ] Abrir un artículo con sesión crea (una sola) fila en `reading_history`; sin sesión, no.
- [ ] Una nota muestra su texto sin markdown y no muestra `ReadTracker`.

## Cómo verificarla a mano

1. Publicá un artículo ([PRD-2.4](PRD-2.4-publish-dialog-tags.md)) y abrí su enlace en una ventana privada (sin sesión): se ve completo.
2. Cambiá el `id` de la URL por uno inventado y por `abc`: 404 en ambos.
3. Escribí en un artículo `[clic](javascript:alert(1))` y `<b>hola</b>`; publicalo y abrilo: el enlace no funciona y `<b>hola</b>` **no** se ve en negrita (el HTML crudo no se interpreta). Anotá qué ves exactamente (texto literal u omitido) y buscá en la documentación de `react-markdown` qué comportamiento documenta.
4. Con sesión, abrí un artículo dos veces y revisá en el SQL Editor `select * from reading_history`: una sola fila, con `read_at` actualizado.
5. `pnpm test`: `src/features/posts/utils.test.ts` cubre `excerpt`, `markdownToPlainText`, `replyTarget`.

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Mostrar las imágenes que ya vienen en el markdown de forma segura (hoy se descartan aunque el editor las conserva) | M |
| Agregar metadatos de la página (título y descripción para compartir): `page.tsx` no define `generateMetadata` | M |
| Tests unitarios de `formatRelativeDate` (rangos "hace X minutos/horas/días") | B |
| Mostrar un mensaje amigable en el 404 de un post (usa la página `not-found.tsx` genérica) | B |

## Preguntas de autoevaluación

1. ¿Qué pasa si alguien abre `/post/<id de un borrador>`? ¿Y si el que abre es el autor?
2. ¿Por qué `ReadTracker` es un componente cliente y no puede hacerse en la página del servidor?
3. ¿Qué hace `MarkdownContent` para que el contenido de otro usuario no pueda inyectar código?
4. ¿Cuándo aparece el botón de resumen y quién lo decide?
5. ¿Por qué releer un artículo no crea una fila nueva en `reading_history`?
6. ¿Qué cambia en la página si el post es una nota que responde a otro?
