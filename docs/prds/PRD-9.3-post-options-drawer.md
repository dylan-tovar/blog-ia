# PRD-9.3 — Menú de opciones de un post (`PostOptionsDrawer`)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-9 — Explorar, Actividad y opciones de post](PRD-9-explore-activity.md) |
| Dificultad | B (básica) |
| Esfuerzo | S (1 punto, menos de un día) |
| Dueño sugerido | D11 |
| Mentor | D6 (apoyo entre pares; escala a D2 o D1) |
| Depende de | [PRD-7.2](PRD-7.2-notes-ui.md) (`EditNoteDialog` y `deleteNote`), [PRD-0.2](PRD-0.2-ui-primitives.md) (`Drawer`) |
| Código | `src/features/posts/components/PostOptionsDrawer.tsx`; se usa desde `PostCard.tsx` y `src/app/(public)/post/[id]/page.tsx` |
| ADRs | [0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md), [0009](../adr/0009-tipos-de-post-y-likes.md), [0015](../adr/0015-notas-editables.md) |

## Resumen

El botón "···" de cada tarjeta del feed y de la página de un post abre un cajón con opciones. **Solo tres son reales** (copiar enlace, editar y eliminar nota); el resto (guardar, ocultar, silenciar, bloquear, reportar...) son botones que solo cierran el cajón. Este paquete consiste en saber distinguir con exactitud qué funciona y qué no, y en decidir con criterio qué hacer con lo que no funciona.

## Qué necesitás entender antes

- [ ] Qué es un **Client Component** con estado (`useState`).
- [ ] Qué es `useTransition` (para mostrar "cargando" mientras corre una Server Action).
- [ ] Qué es un `Drawer` y cómo se abre y cierra de forma controlada ([PRD-0.2](PRD-0.2-ui-primitives.md)).
- [ ] Idea de **confirmación en dos pasos** (un primer toque que pide confirmar y un segundo que ejecuta).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| El componente `PostOptionsDrawer` y sus opciones | Diálogo de edición de la nota (`EditNoteDialog`) y la acción `deleteNote`: [PRD-7.2](PRD-7.2-notes-ui.md) |
| Copiar enlace y el flujo de eliminar con doble toque | El botón "Seguir" real de la cabecera de la tarjeta: [PRD-3.1](PRD-3.1-follow-system.md) |
| Dejar claro qué opciones no tienen efecto | Implementar guardar, ocultar, silenciar, bloquear o reportar (no existe modelo de datos) |

## Cómo funciona

### Props (lo que recibe)

`post` (`id`, `type` = `note` o `article`, `title`, `content`, `author`), `isOwn`, `canDelete`, `canEdit`, `onDeleted`, `onEdited` y `redirectOnDelete`. Las banderas las calcula quien lo usa (`PostCard` y la página `/post/[id]`, con la misma fórmula): `isOwn = viewerId === post.author.id`, `canEdit = isOwn` y `canDelete = isOwn && post.type === "note"`. El cajón solo las obedece.

### Qué pasa al abrirlo

Lectura del archivo, de arriba hacia abajo:

1. `Option` (componente local): un botón con icono, texto y variante `destructive` (rojo).
2. Estado: `open` (cajón), `editOpen` (diálogo de nota), `confirmingDelete` y `isDeleting` (`useTransition`).
3. `handleCopyLink`: copia `<origen>/post/<id>` al portapapeles con `navigator.clipboard.writeText` y cierra el cajón. **No confirma que copió ni maneja un error** del portapapeles.
4. `handleDelete`: el primer toque solo activa `confirmingDelete` (el texto cambia a "Tocá de nuevo para eliminar"); el segundo llama a `deleteNote(post.id)`. Si sale bien, cierra el cajón y, según el caso, redirige a `redirectOnDelete` (la página del post pasa `"/"`) o hace `router.refresh()` y avisa con `onDeleted`. Si falla, vuelve a `confirmingDelete = false`.
5. Al cerrar el cajón se resetea `confirmingDelete`.

### Opciones en un **post propio** (`isOwn`)

| Opción | Estado | Qué hace |
| :--- | :--- | :--- |
| Editar nota | **Real** (si `canEdit` y es nota) | Cierra el cajón y abre `EditNoteDialog` |
| Editar artículo | **Real** (si `canEdit` y es artículo) | Cierra el cajón y va a `/editor/<id>` |
| Copiar enlace | **Real** | Ver arriba |
| Guardar | Sin efecto | Solo cierra el cajón |
| Guardar como imagen | Sin efecto | Solo cierra el cajón |
| Eliminar nota | **Real** (si `canDelete`) | Doble toque, luego `deleteNote` |

### Opciones en un **post ajeno**

| Opción | Estado |
| :--- | :--- |
| Copiar enlace | **Real** |
| Seguir | Sin efecto en el cajón (el seguimiento real está en el botón de la cabecera de la tarjeta) |
| Guardar, Guardar como imagen, Analizar texto con IA, Ocultar publicación, Silenciar, Bloquear, Reportar | Sin efecto: solo cierran el cajón |

Ninguna de las opciones sin efecto tiene modelo de datos que la respalde: en `supabase/migrations/` no hay tablas de guardados, silencios, bloqueos, reportes ni ocultos. "Analizar texto con IA" tampoco está conectada al chat, que solo funciona dentro del editor del autor ([PRD-8](PRD-8-ai-chat.md)).

### Eliminar: solo notas

`deleteNote` (en `features/posts/actions.ts`) valida el id, exige sesión y borra la fila **solo si es una nota del propio autor** (`.eq("author_id", ...)`, `.eq("type", "note")`). **No existe ninguna acción para eliminar un artículo**: por eso la opción se llama "Eliminar nota" y no aparece en artículos.

## Decisiones y por qué

| Decisión | Alternativas | Consecuencia |
| :--- | :--- | :--- |
| **Mostrar todo el menú aunque parte no funcione** | Mostrar solo las opciones reales | Se parece a una app de publicación completa, pero hay botones que el usuario pulsa sin obtener respuesta. Motivo no registrado †; contrasta con el [ADR 0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md), que rechazó copiar funciones "sin función" |
| **Eliminar con doble toque** | Diálogo de confirmación | Rápido y sin pantalla extra. Motivo exacto no registrado † |
| **Solo se pueden eliminar notas** ([ADR 0015](../adr/0015-notas-editables.md) para las notas) | Eliminar también artículos | Los artículos no se pueden borrar desde la app |
| **Las banderas de permiso vienen de fuera** | Calcularlas dentro del cajón | El componente queda simple y reutilizable |

## Criterios de aceptación

- [ ] El botón "···" (`aria-label="Más opciones"`) abre el cajón en cada tarjeta y en la página del post.
- [ ] "Copiar enlace" deja `<origen>/post/<id>` en el portapapeles y cierra el cajón.
- [ ] En una nota propia, "Editar nota" abre el diálogo de edición.
- [ ] En un artículo propio, "Editar artículo" lleva a `/editor/<id>`.
- [ ] "Eliminar nota" necesita dos toques y, al confirmar, la nota desaparece del feed.
- [ ] Al eliminar desde la página del post, se redirige a `/`.
- [ ] En un post ajeno no aparecen opciones de editar ni eliminar.
- [ ] El documento lista con exactitud qué opciones no tienen efecto.

## Cómo verificarla a mano

1. Iniciar sesión, publicar una nota (menú "Crear" → Nota) y abrir "···" en su tarjeta.
2. "Copiar enlace": pegar en la barra del navegador y comprobar que abre `/post/<id>`.
3. "Editar nota": cambiar el texto, guardar y ver el cambio en la tarjeta.
4. "Eliminar nota": un toque cambia el texto del botón; el segundo elimina. Repetir desde la página `/post/<id>` de la nota: debe redirigir a `/`.
5. Abrir "···" en un post de **otra** cuenta: verificar que aparecen las opciones sin efecto y que "Guardar", "Reportar", etc. solo cierran el cajón.
6. Abrir "···" en un artículo propio: no aparece "Eliminar".
7. No hay tests unitarios ni e2e de este componente. `pnpm lint` para comprobar el estilo.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Confirmar visualmente "Copiar enlace" (por ejemplo un aviso "Enlace copiado") y manejar el caso en que el portapapeles falle | B |
| Decidir, con el equipo, qué hacer con cada opción sin efecto (ocultarla hasta que exista o implementarla) y dejar la tabla de decisión en este documento | B |
| Escribir un test unitario o e2e de "Eliminar con doble toque" (primer toque no elimina, segundo sí) | M |
| Proponer un diseño (solo documento) para "Guardar": tabla, política RLS y dónde se vería (`/saved` hoy da 404) | A |
| Proponer cómo eliminar un artículo (política RLS, acción, confirmación) y qué pasa con sus notas y likes | A |

## Preguntas de autoevaluación

1. ¿Qué opciones del cajón funcionan de verdad y cuáles solo cierran el cajón?
2. ¿Quién decide si aparece "Editar" o "Eliminar": el componente o quien lo usa? ¿Por qué?
3. ¿Cómo funciona la confirmación de "Eliminar nota" y qué hace `confirmingDelete`?
4. ¿Por qué no se puede eliminar un artículo? ¿Dónde se comprueba?
5. ¿Qué riesgo tiene dejar botones que no hacen nada y qué opciones hay?
6. ¿Qué falla si el portapapeles no está disponible y cómo se notaría?
