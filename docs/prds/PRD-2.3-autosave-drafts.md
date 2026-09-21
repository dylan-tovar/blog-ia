# PRD-2.3 — Autoguardado y borradores

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-2 — Posts](PRD-2-posts.md) |
| Dificultad / Esfuerzo | M (media) / M (2-3 días) |
| Dueño sugerido / Mentor | D3 / D2 |
| Depende de | [PRD-2.1](PRD-2.1-posts-data-rls.md) (tabla y permisos), [PRD-2.2](PRD-2.2-editor-tiptap.md) (el editor que produce el texto) |
| Código | `src/features/posts/components/editor/use-autosave.ts`, `src/features/posts/actions.ts` (`createDraftPost`, `savePostContent`), `src/features/posts/limits.ts`, `src/features/posts/constants.ts`, `src/features/posts/schemas.ts` (`savePostSchema`), `src/features/posts/components/editor/EditorTopBar.tsx` (estado de guardado) |
| ADRs | [0010](../adr/0010-editor-markdown.md), [0012](../adr/0012-integridad-de-escritura-de-posts.md) |

## Resumen

El autor nunca aprieta "Guardar": lo que escribe se guarda solo, 2 segundos después de dejar de teclear. El primer guardado con contenido **crea** el borrador en la base; los siguientes lo **actualizan**. La barra superior muestra "Guardando…", "Guardado" o el error. El objetivo es que **no se pierda texto** aunque el usuario cierre la pantalla o escriba muy rápido.

## Qué necesitás entender antes

- [ ] Qué es una **Server Action** de Next.js: una función del servidor (`"use server"`) que el navegador llama como si fuera local.
- [ ] Hooks de React: `useRef` (un valor que persiste sin re-renderizar), `useCallback`, `useEffect` con función de limpieza.
- [ ] Qué es un **debounce** (esperar a que el usuario deje de teclear antes de actuar).
- [ ] Qué es una **promesa** y cómo se encadenan (`.then`); la "cola" de escrituras depende de esto.
- [ ] Zod a nivel básico: validar la forma de un objeto (`savePostSchema`).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| El hook `useAutosave` y sus estados | El editor de texto: [PRD-2.2](PRD-2.2-editor-tiptap.md) |
| Crear el borrador de forma perezosa y guardar cambios | Publicar y moderar: [PRD-2.4](PRD-2.4-publish-dialog-tags.md) y [PRD-5.3](PRD-5.3-publish-moderation.md) |
| Límites de título (200) y contenido (100 000) y el contador de caracteres | Guardar tags (van por `addTag`, [PRD-2.4](PRD-2.4-publish-dialog-tags.md)) |
| Limpieza de borradores vacíos ("fantasmas") en `getOwnPosts` | La pantalla `/posts`: [PRD-2.5](PRD-2.5-my-posts-page.md) |

## Cómo funciona

Orden de lectura: `constants.ts` → `limits.ts` → `schemas.ts` → `use-autosave.ts` → `actions.ts` (`createDraftPost`, `savePostContent`) → `EditorTopBar.tsx`.

### 1. El hook `useAutosave(initialPostId, initialDraft)`

Guarda estado en `useRef` (no en `useState`, para no re-renderizar en cada tecla):

| Ref | Qué contiene |
| :--- | :--- |
| `postId` | `"new"` hasta el primer guardado; luego el uuid real |
| `latest` | El último texto escrito (título y contenido) |
| `saved` | El último texto que ya se guardó con éxito |
| `timer` | El temporizador del debounce |
| `queue` | Una cadena de promesas: cada guardado espera al anterior |

Funciones que devuelve: `update(patch)` (avisa que el texto cambió), `persist()` (guarda ya y devuelve el id) y `getContent()`.

### 2. Qué pasa al escribir

```text
update(patch):
  latest = { ...latest, ...patch }
  reiniciar timer de 2000 ms  (AUTOSAVE_DELAY_MS)
  al vencer -> persist()

persist():  (encolado: nunca corren dos guardados a la vez)
  si el borrador supera los límites -> estado "title-too-long" | "content-too-long", NO guarda
  si postId == "new":
      si título y contenido están vacíos -> no hace nada
      createDraftPost(draft) -> guarda el id nuevo
      history.replaceState(... /editor/<id>)   (la URL cambia sin recargar)
  si no:
      si no cambió nada respecto de `saved` -> no hace nada
      savePostContent(id, draft)
  éxito -> "saved"  |  fallo -> "error"
```

Por qué una **cola**: si el usuario teclea, el guardado #1 está en vuelo y llega el #2, sin cola el #2 podría terminar antes que el #1 y **pisar** un texto más nuevo con uno viejo. La cola (`queue.current = queue.current.then(run, run)`) los serializa.

**Al salir de la pantalla**: el `useEffect` de limpieza, si quedaba un temporizador pendiente, lo cancela y llama a `persist()` una última vez.

### 3. Las Server Actions (`actions.ts`)

| Acción | Qué hace | Detalle |
| :--- | :--- | :--- |
| `createDraftPost({title, content})` | Inserta un artículo `draft` propio | Valida con `savePostSchema`; **rechaza título y contenido vacíos**; usa `requireUser()` (sin sesión → `/login`) |
| `savePostContent(postId, {title, content})` | Actualiza **solo** `title` y `content` | Filtra por `id` y `author_id`; devuelve `{ ok }`. No puede tocar `status` ni `updated_at` (privilegios por columna, [PRD-2.1](PRD-2.1-posts-data-rls.md)) |

Ambas devuelven `{ ok: false }` ante cualquier error, sin mensajes técnicos: el hook lo muestra como "No se pudo guardar".

### 4. Límites (`constants.ts`, `limits.ts`, `schemas.ts`)

`POST_TITLE_MAX_LENGTH = 200`, `POST_CONTENT_MAX_LENGTH = 100_000`. `findLimitIssue` los revisa en el cliente (para avisar y no guardar); `savePostSchema` los vuelve a validar en el servidor (nunca confíes solo en el cliente). `contentCounter` muestra "N caracteres restantes" recién a partir del 90 %; `fitsContentLimit` también lo usa el chat de IA antes de aplicar un cambio ([PRD-8.3](PRD-8.3-editor-context-apply.md)). El límite de contenido **no** existe como restricción en la base: solo lo hace cumplir la aplicación.

### 5. Los "fantasmas"

`createDraftPost` no crea borradores vacíos, pero `savePostContent` **sí acepta** un guardado vacío: si el autor escribe algo, se crea el borrador, y luego borra todo, la fila queda vacía. Para que no ensucie la lista, `getOwnPosts` (en `queries.ts`) **borra** los borradores con título y contenido en blanco cada vez que se carga `/posts`. Es una lectura con efecto de escritura (ver trabajo pendiente).

## Decisiones y por qué

| Decisión | Alternativas | Por qué |
| :--- | :--- | :--- |
| Crear la fila en el primer guardado con contenido, no al abrir el editor | Crear el borrador al pulsar "Nuevo artículo" (diseño original) | Abrir el editor y salir no deja borradores vacíos †. El motivo del cambio respecto del diseño original no quedó registrado |
| Debounce de 2 s | Guardar en cada tecla; botón "Guardar" | Menos escrituras a la base sin sensación de pérdida †; contrapartida: hasta 2 s de trabajo sin guardar |
| Cola de promesas | Guardados en paralelo | Evita que un guardado viejo termine después y pise uno nuevo |
| Validar límites en el cliente **y** el servidor | Solo en uno | El cliente da feedback inmediato; el servidor es la defensa real |
| El cliente solo actualiza `title` y `content` | Permitir más columnas | [ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md) |

## Criterios de aceptación

- [ ] Escribir en `/editor/new` crea un borrador al primer autoguardado y la URL pasa a `/editor/<id>` sin recargar.
- [ ] La barra muestra "Guardando…" y luego "Guardado"; ante un fallo, "No se pudo guardar".
- [ ] Editar de nuevo actualiza la misma fila (no crea otra).
- [ ] Un título de más de 200 caracteres o un contenido de más de 100 000 muestra el aviso y **no** se guarda.
- [ ] Cerrar la pantalla con cambios pendientes los guarda al desmontar.
- [ ] Un borrador vacío no aparece en `/posts`.

## Cómo verificarla a mano

1. `pnpm dev`, iniciá sesión, abrí `/editor/new` y escribí una frase.
2. Esperá 2 segundos: debe decir "Guardado" y la URL debe cambiar a `/editor/<uuid>`.
3. En `/posts` debe aparecer el borrador "Borrador".
4. Volvé al editor, borrá **todo** el texto, esperá "Guardado", volvé a `/posts`: el borrador vacío ya no debe estar.
5. Pegá un texto larguísimo (más de 100 000 caracteres): debe aparecer "El artículo es demasiado largo".
6. `pnpm test`: mirá `limits.test.ts` y `schemas.test.ts` (`savePostSchema`).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Sacar la limpieza de "fantasmas" de una lectura (`getOwnPosts`) y hacerla en el momento de guardar vacío o en una acción propia | M |
| El hook no registra `beforeunload`: si se cierra la **pestaña** antes de los 2 s, los cambios se pierden (la limpieza de `useEffect` solo cubre navegar dentro de la app). Evaluar avisar al usuario | M |
| Tras un error de guardado no hay reintento automático: solo se vuelve a intentar con la próxima edición | M |
| Extraer la lógica de la cola/estados a una función pura y agregarle tests unitarios (hoy `use-autosave` solo se cubre por e2e, y ese e2e está desactualizado: [PRD-X.1](PRD-X.1-testing-e2e.md)) | A |

## Preguntas de autoevaluación

1. ¿Por qué se usa `useRef` y no `useState` para `latest` y `saved`?
2. ¿Qué problema resuelve la cola de promesas? Dá un ejemplo concreto de cómo fallaría sin ella.
3. ¿Cuándo se crea realmente la fila del borrador y por qué la URL cambia con `replaceState`?
4. ¿Por qué el servidor vuelve a validar el largo del contenido si el cliente ya lo hizo?
5. ¿Cómo puede existir un borrador vacío si `createDraftPost` lo rechaza?
6. ¿Qué pasa si el autor cierra la pestaña 1 segundo después de escribir?
