# PRD 9 - Explorar, Actividad y opciones de post

| Campo | Valor |
| :--- | :--- |
| Estado | **Parcial.** `/explore` y la navegación están implementadas. `/activity` es un estado vacío estático. El menú de opciones de un post mezcla acciones reales (copiar enlace, editar, eliminar nota) con **botones sin efecto** |
| Depende de | [PRD-2](PRD-2-posts.md) (posts y tags), [PRD-3](PRD-3-feed-follows.md) (feed y seguir), [PRD-7](PRD-7-notes-likes.md) (notas y likes) |
| Migraciones | Ninguna propia. `/explore` usa `tags` y `post_tags` (`0002_posts.sql`) |
| ADRs relacionados | [0004](../adr/0004-recomendaciones-scoring-determinista.md), [0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md), [0020](../adr/0020-tags-como-metadato-interno.md), [0021](../adr/0021-feed-en-raiz-y-global.md) |
| Código | `src/app/(public)/explore/page.tsx`, `src/app/(dashboard)/activity/page.tsx`, `src/features/posts/components/PostOptionsDrawer.tsx`, `src/components/shared/{navigation,BottomNav,MainNav,HeaderAccount,HeaderTitle,AccountDrawer}.ts(x)` |

## Paquetes de trabajo

Este PRD se reparte en tres paquetes que se pueden asignar por separado ([reparto del equipo](../team/reparto-de-tareas.md)).

| Paquete | Qué cubre | Dificultad | Esfuerzo |
| :--- | :--- | :--- | :--- |
| [PRD-9.1 — Página Explorar](PRD-9.1-explore-page.md) | `/explore`, chips de tags, filtro `?tag=` | B | S |
| [PRD-9.2 — Actividad y destinos de navegación](PRD-9.2-activity-nav.md) | `/activity` (placeholder), `NAV_ITEMS` | B | S |
| [PRD-9.3 — Menú de opciones de un post](PRD-9.3-post-options-drawer.md) | `PostOptionsDrawer`: opciones reales y sin efecto | B | S |

## Resumen

Este PRD describe las superficies que rodean al feed: cómo se llega a cada pantalla (barra de navegación y menú de cuenta), la página **Explorar** (feed filtrable por tag, la única interfaz pública que muestra tags), la pantalla **Actividad** (todavía sin contenido) y el menú **más opciones** de cada post. Varias de estas piezas se construyeron para que la app se parezca a una app móvil de publicación completa, sin que exista el modelo de datos detrás: por eso este documento distingue con claridad lo que funciona de lo que es decoración.

## Problema y objetivo

**Problema.** El feed de `/` es cronológico y global ([ADR 0021](../adr/0021-feed-en-raiz-y-global.md)), y los tags no se muestran en las tarjetas ([ADR 0020](../adr/0020-tags-como-metadato-interno.md)). Sin otra superficie, un lector no tiene forma de filtrar por tema, y la navegación de la app quedaba corta frente al diseño móvil elegido en [ADR 0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md).

**Objetivo.**

- Dar una página de descubrimiento por tag sin ensuciar las tarjetas.
- Tener una navegación coherente de cuatro destinos en móvil y escritorio.
- Reservar el lugar de la actividad del usuario y de las acciones por post que un producto de este tipo suele tener.
- Dejar registrado, sin ambigüedad, qué de eso está construido y qué no.

## Alcance / fuera de alcance

| Dentro | Fuera (no existe hoy) |
| :--- | :--- |
| `/explore`: fila de chips por tag y el mismo feed paginado | Búsqueda de texto (no hay campo ni consulta de búsqueda) |
| Navegación de cuatro destinos y menú de cuenta | Notificaciones, "no leído" y cualquier dato en `/activity` |
| Menú de opciones del post: copiar enlace, editar y eliminar nota | Guardar/marcar, ocultar, silenciar, bloquear, reportar, guardar como imagen |
| Títulos de página por ruta | Las rutas del menú de cuenta que no existen (ver más abajo) |

## Cómo funciona

### 1. Navegación

`NAV_ITEMS` (`src/components/shared/navigation.ts`) define cuatro destinos: **Inicio** (`/`), **Explorar** (`/explore`), **Actividad** (`/activity`) y **Perfil** (`/profile`, que redirige a `/author/<id>` del usuario).

| Superficie | Cuándo aparece | Archivo |
| :--- | :--- | :--- |
| Barra inferior con iconos | Solo con sesión y por debajo de `md`. Perfil es un icono más | `BottomNav.tsx` |
| Iconos en la barra superior | Solo con sesión y desde `md`. Sin el ítem Perfil: el avatar ya lleva a él | `MainNav.tsx`, `HeaderAccount.tsx` |
| Botones "Iniciar sesión" y "Registrarse" | Sin sesión. Un visitante anónimo **no** ve la navegación y solo llega a `/explore` por URL | `HeaderAccount.tsx` |
| Título de la barra superior | Según el primer segmento de la ruta (`getPageTitle`): Inicio, Explorar, Actividad, "Mis posts", "Settings", Perfil, Post, Autor. Una ruta desconocida muestra "Inicio" | `HeaderTitle.tsx`, `navigation.ts` |
| Estado activo | Igualdad exacta o prefijo de ruta; Perfil también está activo en `/author/*` | `isNavItemActive` |

**Menú de cuenta** (`AccountDrawer.tsx`): se abre con el avatar. Contiene el encabezado del perfil (funciona: enlaza a `/profile`), Home, Explore, Activity, Settings y Sign out (funcionan) y además enlaces a rutas que **no existen**: `/subscriptions`, `/saved`, `/support`, `/about`, `/privacy`, `/terms`, `/data` y `/accessibility`. Verificado: `src/app` no tiene ninguna de esas carpetas, así que cada uno lleva a la página 404 de la app. Las etiquetas de este menú están en inglés, mientras el resto de la interfaz está en español.

### 2. Explorar (`/explore`)

```text
ExplorePage(?tag=x):
  tag = tagNameSchema(x)        // recortado, en minúsculas, de 1 a 50 caracteres; si no es válido, sin filtro
  tags  = getAllTagNames()      // todos los nombres de la tabla tags, por orden alfabético
  feed  = getFeedPage({ tag })  // 20 artículos y notas publicados, más recientes primero

  mostrar la fila de chips (solo si hay al menos un tag): "Todos" y "#tag" por cada uno,
    el activo resaltado; cada chip es un enlace a /explore?tag=<tag>
  mostrar el feed con el mismo FeedList que el inicio ("Cargar más" en páginas de 20)
  sin resultados -> "No hay publicaciones con el tag #x." (o "Todavía no hay publicaciones para explorar.")
```

| Aspecto | Detalle |
| :--- | :--- |
| Acceso | Público, con o sin sesión (`getViewer()` solo decide los controles de seguir y likes) |
| Contenido | Artículos **y** notas publicados, igual que `/`. No muestra "Recomendados para ti" ni la barra de crear |
| Filtro | Una consulta con `post_tags!inner(tags!inner(name))` y `eq` sobre el nombre. Los tags se usan solo para filtrar: nunca se piden para mostrarse en las tarjetas |
| Lista de chips | `getAllTagNames` devuelve **todo** el catálogo de `tags`, sin cruzarlo con posts publicados. Puede haber chips cuyo filtro no devuelve nada (por ejemplo, un tag creado en un borrador). Un tag sin uso no se elimina |
| Paginación | El `FeedList` se reinicia al cambiar de tag (`key`) |
| Búsqueda | No hay campo ni consulta de texto |

Los mismos tags se pueden filtrar en el inicio con `/?tag=x`, pero sin controles en pantalla: la interfaz de filtro es solo `/explore`.

### 3. Actividad (`/activity`)

Placeholder. La página exige sesión (`getViewer()`, y redirige a `/login`; no está en `PROTECTED_PATHS` del proxy) y muestra un icono de campana, "No tenés actividad reciente" y "Cuando otros usuarios le den me gusta a tus publicaciones, dejen notas o te sigan, lo verás acá.". **No hay consulta, ni tabla de notificaciones, ni estado de lectura**: el texto promete algo que no existe todavía. Los datos de origen sí existen por separado (`likes`, notas con `parent_post_id`, `subscriptions`), pero nada los junta.

### 4. Menú de opciones de un post (`PostOptionsDrawer`)

Un cajón que se abre con el botón "···" de cada tarjeta del feed y de la página del post.

**En un post propio**

| Opción | Estado | Qué hace |
| :--- | :--- | :--- |
| Editar nota | Real | Abre `EditNoteDialog` |
| Editar artículo | Real | Va a `/editor/<id>` |
| Copiar enlace | Real | Copia `<origen>/post/<id>` al portapapeles y cierra el cajón. No confirma y no maneja un fallo del portapapeles |
| Eliminar nota | Real (solo notas) | Pide un segundo toque ("Tocá de nuevo para eliminar") y ejecuta `deleteNote` |
| Guardar | **Sin efecto** | Solo cierra el cajón |

**En un post ajeno**

| Opción | Estado |
| :--- | :--- |
| Copiar enlace | Real |
| Seguir | **Sin efecto** en el cajón (solo cierra). El seguimiento real está en el botón "Seguir" de la cabecera de la tarjeta |
| Guardar, Ocultar publicación, Bloquear, Reportar | **Sin efecto**: solo cierran el cajón |

No existe ningún modelo de datos que respalde los botones sin efecto: una búsqueda en `supabase/migrations/` no encuentra tablas de guardados, bloqueos, reportes ni ocultos. Tampoco hay ninguna acción para eliminar un **artículo**: la única acción de borrado es `deleteNote`.

## Decisiones y por qué

"Registrado" significa que consta en un ADR, en un comentario o en el propio código; "no registrado" significa que el repositorio no conserva el motivo y este documento no lo inventa.

### 1. Los tags solo se ven en Explorar

- **Elegido.** Las tarjetas, el post y el perfil de autor no muestran tags; `/explore` los muestra como chips y filtra con `?tag=`.
- **Por qué (no registrado).** El [ADR 0004](../adr/0004-recomendaciones-scoring-determinista.md) lo llama "regla de producto" sin explicación, y [ADR 0020](../adr/0020-tags-como-metadato-interno.md) lo documenta con el motivo marcado como no registrado. Lo que sí consta es el efecto: las tarjetas quedan limpias y los tags siguen alimentando recomendaciones y moderación.
- **Consecuencia.** El comentario de `src/app/(public)/page.tsx` ("Tags are not shown anywhere in the UI") ya no es exacto porque `/explore` los muestra como chips.

### 2. Cuatro destinos de navegación

- **Elegido.** Inicio, Explorar, Actividad y Perfil. "Mis posts" salió de la barra y quedó como ruta (`/posts`), a la que se llega desde el editor y desde `/settings`.
- **Por qué (registrado).** [ADR 0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md): la interfaz debía parecerse a una app móvil de publicación, con barra inferior. La decisión original tenía tres destinos y previó revisar la navegación cuando existieran "más destinos" (comentarios, notificaciones, búsqueda).
- **Consecuencia.** Se agregaron los destinos Explorar y Actividad, y dos de ellos resultan de mayor alcance visual que funcional (ver limitaciones).

### 3. Actividad como pantalla vacía

- **Elegido.** Reservar el destino con un estado vacío estático.
- **Por qué (no registrado).** No hay una decisión escrita sobre `/activity`. El [ADR 0021](../adr/0021-feed-en-raiz-y-global.md) deja notificaciones fuera del alcance de [PRD-3](PRD-3-feed-follows.md) y menciona `/activity` como pantalla vacía. La lectura razonable (deducida) es completar la navegación de cuatro destinos hasta que exista un modelo de actividad.
- **Consecuencia.** El texto de la pantalla promete likes, notas y seguidores que no se muestran.

### 4. Opciones de post: mostrar todo el menú aunque parte no funcione

- **Elegido.** El cajón replica el menú de una app de publicación completa; las opciones sin respaldo cierran el cajón.
- **Por qué (no registrado).** No hay ADR ni comentario que explique la decisión. Contrasta con [ADR 0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md), que rechazó "copiar likes, comentarios e inbox" porque serían "botones sin función".
- **Consecuencia.** Botones sin efecto que un usuario puede pulsar sin obtener respuesta. Decidir entre implementarlos o quitarlos es trabajo pendiente.

## Criterios de aceptación

Lo que hoy se cumple:

- [x] Con sesión, la navegación muestra cuatro destinos: barra inferior por debajo de `md`, iconos en la barra superior desde `md`.
- [x] Sin sesión, la barra superior ofrece "Iniciar sesión" y "Registrarse" y no muestra la navegación.
- [x] `/explore` es público y muestra la fila "Todos" y `#tag` con un chip por cada tag del catálogo.
- [x] Elegir un chip filtra el feed con `?tag=`; "Todos" quita el filtro; un tag sin resultados muestra el mensaje vacío.
- [x] El feed de `/explore` pagina de a 20 con "Cargar más" y se reinicia al cambiar de tag.
- [x] Ninguna tarjeta, página de post ni perfil de autor muestra tags.
- [x] `/activity` redirige a `/login` sin sesión y con sesión muestra el estado vacío.
- [x] "Copiar enlace", "Editar nota/artículo" y "Eliminar nota" (con doble toque) funcionan en el post propio.

Lo que **no** se cumple hoy (opciones del menú sin efecto, `/activity` sin actividad real y enlaces rotos del menú de cuenta) está en «Limitaciones conocidas y deuda», como trabajo pendiente para quien lo construya.

## Limitaciones conocidas y deuda

| Tema | Detalle |
| :--- | :--- |
| Enlaces rotos en el menú de cuenta | `/subscriptions`, `/saved`, `/support`, `/about`, `/privacy`, `/terms`, `/data` y `/accessibility` no existen y devuelven 404 |
| Idioma mezclado | El menú de cuenta ("Home", "Subscriptions", "Saved", "Sign out"…) y el título de `/settings` ("Settings") están en inglés, el resto de la interfaz en español |
| Opciones sin efecto | Ver la tabla de `PostOptionsDrawer`; ninguna tiene modelo de datos |
| `/activity` vacío | El texto promete información que no se calcula |
| Sin búsqueda | El diseño la sugiere; no hay campo, consulta ni ruta |
| Chips sin control de calidad | Aparecen todos los tags del catálogo aunque no tengan posts publicados; con un catálogo grande la fila deja de escalar ([ADR 0020](../adr/0020-tags-como-metadato-interno.md)) |
| Copiar enlace sin retroalimentación | No hay confirmación visual ni manejo de error del portapapeles |
| Sin borrado de artículos | Solo se pueden eliminar notas |
| Visitantes anónimos sin navegación | Sin sesión no hay barra de navegación; `/explore` solo se alcanza por URL |
| Comentario desactualizado | `src/app/(public)/page.tsx` afirma que los tags no se muestran en ninguna parte de la interfaz |
| Pruebas desactualizadas | `e2e/shell.spec.ts` ("shows the bottom navigation with the three destinations") espera los enlaces `Inicio`, `Mis posts`, `Perfil`, pero la barra actual tiene `Inicio`, `Explorar`, `Actividad`, `Perfil` (comprobación estática; no se ejecutó) |

## Pruebas

**Unitarias (Vitest, `pnpm test`)**

| Área | Archivo |
| :--- | :--- |
| Destinos de navegación, títulos y estado activo | `src/components/shared/navigation.test.ts` |
| Schema del filtro de tags y del feed | `src/features/posts/schemas.test.ts` |

**E2E (Playwright)**

| Cobertura | Archivo |
| :--- | :--- |
| Filtro `/?tag=` y que los tags no se muestran en `/` ni en el post | `e2e/feed.spec.ts` |
| Shell: título de cabecera, navegación móvil y de escritorio | `e2e/shell.spec.ts` (con la salvedad de la barra desactualizada) |

**Sin cobertura**: `/explore` (chips y filtro), `/activity`, `PostOptionsDrawer` y `AccountDrawer`.
