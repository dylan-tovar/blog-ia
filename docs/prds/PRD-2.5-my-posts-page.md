# PRD-2.5 — Página "Mis posts"

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-2 — Posts](PRD-2-posts.md) |
| Dificultad / Esfuerzo | B (básica) / S (hasta 1 día) |
| Dueño sugerido / Mentor | D9 / D2 |
| Depende de | [PRD-2.1](PRD-2.1-posts-data-rls.md) (la consulta `getOwnPosts`), [PRD-0.3](PRD-0.3-app-shell.md) (el marco de la página) |
| Código | `src/app/(dashboard)/posts/page.tsx`, `src/features/posts/components/PostStatusBadge.tsx`, `getOwnPosts` en `src/features/posts/queries.ts`, `src/lib/format.ts` (`formatShortDate`) |
| ADRs | [0003](../adr/0003-seguridad-rls-y-proxy-minimo.md) |

## Resumen

`/posts` es la lista privada de **mis artículos**, sin importar su estado (borrador, en revisión, publicado, rechazado). Cada fila muestra el título, la fecha de última actualización y una etiqueta de color con el estado, y lleva al editor. Es una página simple: sirve para aprender cómo una página de Next.js pide datos en el servidor y los dibuja.

## Qué necesitás entender antes

- [ ] Qué es un **Server Component**: un componente de React que se ejecuta en el servidor y puede pedir datos con `await`, sin `useEffect`.
- [ ] Qué es `map` sobre un array para dibujar una lista en JSX (con `key`).
- [ ] Qué hace `Link` de Next.js.
- [ ] Qué es un "estado" de un artículo (`draft`, `pending_review`, `published`, `rejected`).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| La página `/posts` y su estado vacío | El editor al que lleva cada fila: [PRD-2.2](PRD-2.2-editor-tiptap.md) |
| La etiqueta de estado `PostStatusBadge` | El botón "+" / menú "Crear" que crea posts: [PRD-0.3](PRD-0.3-app-shell.md) y [PRD-7.2](PRD-7.2-notes-ui.md) |
| El formato de la fecha "Actualizado el …" | Listar **notas**: esta lista solo muestra artículos (`type = 'article'`) |

## Cómo funciona

Orden de lectura: `PostStatusBadge.tsx` → `page.tsx` → `getOwnPosts` en `queries.ts`.

1. **Protección.** `/posts` está en la lista `PROTECTED_PATHS` de `src/proxy.ts` (`/settings`, `/editor`, `/posts`): sin sesión, el proxy redirige a `/login`. Además `getOwnPosts` llama a `redirect("/login")` si no hay usuario.
2. **Datos.** `page.tsx` es un Server Component `async`: hace `const posts = await getOwnPosts()`. Esa función pide a la base los artículos del usuario ordenados por `updated_at` descendente (los que cambiaron hace poco, arriba).
3. **Limpieza.** Antes de devolver la lista, `getOwnPosts` **borra** los borradores completamente vacíos ("fantasmas", ver [PRD-2.3](PRD-2.3-autosave-drafts.md)) y los saca del resultado.
4. **Dibujo.** Si no hay posts, muestra "Todavía no creaste ningún post. Tocá + para empezar.". Si hay, una lista donde cada fila es un `Link` a `/editor/<id>` con: título (o "Sin título"), "Actualizado el <fecha corta>" y el `PostStatusBadge`.
5. **La etiqueta.** `PostStatusBadge` traduce el estado con dos tablas: `STATUS_LABELS` (Borrador, En revisión, Publicado, Rechazado) y `STATUS_CLASSES` (colores: gris, ámbar, verde, rojo). También se usa en la barra del editor ([PRD-2.4](PRD-2.4-publish-dialog-tags.md)).

El `<h1>` "Mis posts" existe pero es solo para lectores de pantalla (`sr-only`): el título visible lo pone el encabezado del marco de la app ([PRD-0.3](PRD-0.3-app-shell.md)).

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| Lista plana ordenada por `updated_at`, sin agrupar por estado | Es lo más simple; el diseño original hablaba de agrupar o filtrar por estado y no se implementó † (motivo no registrado) |
| Todas las filas llevan al editor, también las publicadas | Desde el editor se puede ver y editar tags y contenido; ver la versión pública requiere ir a `/post/<id>` a mano |
| Borrar fantasmas al listar | Evita mostrar borradores vacíos sin necesitar un proceso aparte † |

## Criterios de aceptación

- [ ] Sin sesión, `/posts` redirige a `/login`.
- [ ] Con sesión y sin artículos se ve el mensaje "Todavía no creaste ningún post. Tocá + para empezar.".
- [ ] Cada artículo propio aparece una sola vez con su título (o "Sin título"), fecha y etiqueta de estado correcta.
- [ ] El más recientemente editado aparece primero.
- [ ] Un click en una fila abre `/editor/<id>`.
- [ ] Los artículos de otras personas y las notas **no** aparecen.

## Cómo verificarla a mano

1. `pnpm dev`, iniciá sesión con un usuario nuevo y entrá a `/posts`: debe verse el mensaje vacío.
2. Creá un borrador en `/editor/new`, esperá "Guardado" y volvé a `/posts`: aparece con etiqueta "Borrador".
3. Publicalo ([PRD-2.4](PRD-2.4-publish-dialog-tags.md)): la etiqueta pasa a "Publicado" en verde.
4. Cerrá sesión y visitá `/posts`: te manda a `/login`.
5. `pnpm test`: no hay un test propio de esta página; el helper de formato (`formatShortDate`) no tiene tests todavía (ver trabajo pendiente).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Que las filas publicadas tengan un enlace secundario a la vista pública `/post/<id>` | B |
| Agrupar o filtrar por estado (Borrador / En revisión / Publicado / Rechazado) | M |
| Mostrar el motivo de rechazo en la fila de un artículo `rejected` (`getOwnPosts` ya trae `rejection_reason` pero la lista no lo usa) | B |
| Escribir tests unitarios de `formatShortDate` y `getInitials` de `src/lib/format.ts` | B |
| Acción "Eliminar artículo" con confirmación (hoy solo existe `deleteNote`; RLS ya permite borrar) | M |

## Preguntas de autoevaluación

1. ¿Por qué `page.tsx` puede usar `await` directamente y un componente cliente no?
2. ¿Qué dos mecanismos impiden que un visitante sin sesión vea `/posts`?
3. ¿Qué es un "borrador fantasma" y quién lo borra?
4. ¿Por qué esta lista no muestra las notas?
5. ¿Qué hace `key` en un `map` de React y por qué se usa `post.id`?
