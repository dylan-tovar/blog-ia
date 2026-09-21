# 0010. Editor de artículos con Tiptap y markdown como fuente de verdad

- **Estado:** Aceptada
- **Fecha:** 2026-09-19
- **Fuentes:** [PRD-2](../prds/PRD-2-posts.md), `src/features/posts/components/editor/`, `src/features/posts/components/MarkdownContent.tsx`, `src/app/(editor)/`

## Contexto

El artículo necesita un editor completo (título, formato, vista previa) y no un `Textarea`. El contenido tiene que seguir siendo texto plano en `posts.content`, porque las funciones de IA de PRD-5/6 leen ese texto, y lo que se renderiza a los lectores no puede abrir una superficie de XSS.

## Decisión

- **Editor:** Tiptap v3 (WYSIWYG sobre ProseMirror) con `@tiptap/markdown`. El markdown es la fuente de verdad: se carga con `contentType: 'markdown'` y se guarda con `editor.getMarkdown()`; no hay cambios en la base. Títulos solo h2 y h3 (el título es un campo aparte) y sin subrayado (markdown no lo tiene). Tablas, imágenes y listas de tareas están registradas **sin botón en la barra**: sirven para que un markdown que ya las contiene sobreviva a abrirlo, editarlo y guardarlo (verificado: cada una hace ida y vuelta idempotente; sin las extensiones se perdían). El enlace es un `Link` propio (`SafeLink`) que descarta los `href` no permitidos al parsear markdown (solo http, https, mailto y relativos; `javascript:` queda como texto), porque el `Link` de Tiptap no aplica `isAllowedUri` en ese camino. Se monta con `immediatelyRender: false` por el SSR de Next.
- **Render a lectores:** `MarkdownContent` usa `react-markdown` con `remark-gfm`. No se renderiza HTML crudo (no hay `rehype-raw`), se descartan las imágenes, se conserva la sanitización de URLs por defecto (`javascript:` queda inerte) y los enlaces externos llevan `target="_blank"` y `rel="noopener noreferrer nofollow"`. Las notas siguen siendo texto plano.
- **Estilos:** `@tailwindcss/typography` con las mismas clases `prose` (`markdown-styles.ts`) en el editor, la vista previa y el post publicado, para que se vean igual.
- **Excerpts:** `excerpt()` pasa por `markdownToPlainText`, así las cards no muestran `#`, `**` ni sintaxis de enlaces.
- **Pantalla completa:** `/editor/[id]` vive en el grupo `(editor)` con un layout sin `AppShell` (sin barras ni botón "+"). `proxy.ts` protege `/editor` por ruta, no por grupo, así que no cambia. El `DesktopOnly` de [ADR 0009](0009-tipos-de-post-y-likes.md) se mantiene.
- **Flujo de publicación:** la barra superior tiene "Vista previa" (renderiza con `MarkdownContent`, igual que el lector) y "Continuar", que abre un diálogo con los tags y el botón "Publicar". En un artículo ya publicado el botón dice "Tags" y el diálogo solo edita tags. Ahí mismo entrarán la moderación y las sugerencias de tags de PRD-5.
- **Límites:** título de hasta 200 caracteres y contenido de hasta 100 000, validados en el schema compartido que usan `createDraftPost` y `savePostContent`. El editor comprueba los mismos límites antes de guardar (`limits.ts`): muestra "El título/artículo es demasiado largo" en vez de un error genérico y un contador desde el 90 % del límite.
- **Publicar:** `publishPost(postId)` ya no recibe el contenido; lee de la base el contenido guardado del propio artículo y rechaza publicar si está vacío. El editor guarda (flush del autosave) antes de llamarla.
- **Fuera de alcance por ahora:** ~~subida y botón de imágenes~~ (resuelto, ver la actualización del 2026-09-21), botón de tablas, subtítulo (no hay almacenamiento ni campo en el modelo). Las imágenes que ya estén en el markdown se conservan en el editor pero **los lectores no las ven** (`MarkdownContent` las descarta). El HTML crudo dentro del markdown se pierde al abrirlo en el editor (tampoco se renderiza a lectores).

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| `Textarea` con vista previa | No es un editor de verdad; el autor tendría que escribir la sintaxis a mano |
| CodeMirror (markdown en crudo + vista previa) | Más cercano al texto, pero el diseño buscado es un editor con barra de formato tipo Substack |
| MDXEditor | Trae soporte de JSX y una API más pesada de lo que el modelo de datos necesita |
| Guardar el JSON de ProseMirror | Obliga a convertir para la IA y para el render, y cambia el esquema |
| `rehype-raw` para permitir HTML | Abre XSS; el editor no necesita HTML para nada de lo que ofrece |

## Consecuencias

- **A favor:** el contenido sigue siendo markdown legible por IA y por cualquier renderer; render seguro por defecto; editor y post publicado se ven igual.
- **En contra:** el editor suma unos 100–150 kB de JavaScript, aunque solo se carga en `/editor` (que es de escritorio); el ida y vuelta por Tiptap normaliza la sintaxis sin cambiar lo que se ve (`<https://…>` pasa a `[…](…)`, `*` suelto se escapa, las tablas se re-alinean).
- **Cuándo revisar:** al agregar imágenes (hace falta almacenamiento y decidir cómo se renderizan de forma segura), tablas o subtítulo, o si se permite editar desde móvil.

## Actualización (2026-09-20)

La frase "Ahí mismo entrarán la moderación y las sugerencias de tags de PRD-5" ya se cumplió: "Publicar" en el diálogo llama a `publishPost`, que modera con Gemini y adjunta los tags sugeridos ([ADR 0011](0011-ia-con-gemini.md)). Además, el editor incluye el cajón del chat de IA (`Cmd/Ctrl+I`) que lee y propone cambios sobre este mismo documento ([ADR 0013](0013-chat-ia-protocolo-ndjson-y-function-calling.md), [ADR 0014](0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)); el editor es el que expone el documento en bloques `b0`, `b1`…

## Actualización (2026-09-21)

Las imágenes ya se pueden subir (botón, arrastrar y pegar) y los lectores las ven: se guardan en Supabase Storage y `MarkdownContent` deja de descartar `img`, pero solo renderiza las del bucket propio ([ADR 0022](0022-imagenes-en-supabase-storage.md)). Lo demás de esta decisión no cambia: el markdown sigue siendo la fuente de verdad (`![alt](url)` hace ida y vuelta) y el HTML crudo sigue sin renderizarse.
