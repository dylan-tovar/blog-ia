# PRD-9.1 — Página Explorar (`/explore`)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-9 — Explorar, Actividad y opciones de post](PRD-9-explore-activity.md) |
| Dificultad | B (básica) |
| Esfuerzo | S (1 punto, menos de un día) |
| Dueño sugerido | D9 |
| Mentor | D6 (apoyo entre pares; escala a D2 o D1) |
| Depende de | [PRD-3.2](PRD-3.2-feed-list.md) (`FeedList` y `getFeedPage`), [PRD-2.1](PRD-2.1-posts-data-rls.md) (tablas `tags` y `post_tags`) |
| Código | `src/app/(public)/explore/page.tsx`, `getAllTagNames` y `getFeedPage` en `src/features/posts/queries.ts`, `tagNameSchema` en `src/features/posts/schemas.ts` |
| ADRs | [0004](../adr/0004-recomendaciones-scoring-determinista.md), [0020](../adr/0020-tags-como-metadato-interno.md), [0021](../adr/0021-feed-en-raiz-y-global.md) |

## Resumen

La única pantalla de la app que **muestra los tags**: una fila de "chips" (`Todos`, `#ia`, `#next`...) sobre el mismo feed de publicaciones de la portada. Al elegir un chip se filtra el feed por ese tag. Es una página corta (unas 70 líneas) y sirve para practicar cómo una página del servidor lee parámetros de la URL, pide datos y arma la pantalla.

## Qué necesitás entender antes

- [ ] Qué es un **Server Component** que puede ser `async` y pedir datos directamente.
- [ ] Qué es un **parámetro de búsqueda** de URL (`/explore?tag=ia`) y cómo se lee (`searchParams`).
- [ ] Qué hace `Promise.all` (lanzar varias consultas a la vez).
- [ ] Idea de tabla de muchos a muchos: un post tiene varios tags y un tag está en varios posts (`post_tags`).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| La página `/explore`, la fila de chips y el filtro `?tag=` | El feed en sí (`FeedList`, `PostCard`, "Cargar más"): [PRD-3.2](PRD-3.2-feed-list.md) |
| `getAllTagNames` y el schema del tag | Asignar tags a un post: [PRD-2.4](PRD-2.4-publish-dialog-tags.md) |
| Mensajes de "sin resultados" | Búsqueda de texto (no existe) |

## Cómo funciona

Todo está en `src/app/(public)/explore/page.tsx`. Lectura paso a paso:

```text
ExplorePage(props):
  rawTag      = props.searchParams.tag
  selectedTag = tagNameSchema.safeParse(rawTag)   // recorta, minúsculas, 1 a 50 caracteres
                si no es válido -> sin filtro

  [viewer, tags, { posts, hasMore }] = Promise.all([
      getViewer(),                     // solo decide controles de seguir y likes
      getAllTagNames(),                // todos los nombres de la tabla tags, alfabéticos
      getFeedPage({ tag: selectedTag })// 20 publicaciones más recientes, filtradas si hay tag
  ])

  si hay al menos un tag -> fila de chips: "Todos" + "#tag" por cada uno, el activo resaltado
  si no hay posts        -> mensaje vacío
  si hay posts           -> <FeedList key={selectedTag ?? "all"} .../>
```

Puntos importantes:

- **Los chips son enlaces**, no botones con estado: `href="/explore?tag=<tag>"` (con `encodeURIComponent`). El "estado" es la URL. `Todos` enlaza a `/explore`.
- **`key={selectedTag ?? "all"}`** en `FeedList`: al cambiar de tag, React descarta el componente y crea uno nuevo, así "Cargar más" vuelve a empezar desde la primera página.
- **`getFeedPage`** (en `queries.ts`) siempre filtra `status = 'published'`. Con tag, une con `post_tags` y `tags` (`!inner`: solo posts que tienen ese tag) y filtra por el nombre. Los tags **nunca se piden para mostrarse** en las tarjetas.
- **`getAllTagNames`** hace `select name from tags order by name` y devuelve todos los nombres, **sin cruzarlos con posts publicados**. Puede haber chips que no devuelven nada (por ejemplo, un tag creado en un borrador).
- Es una página **pública**: funciona con o sin sesión. Sin sesión, `viewer` es `null`.
- Muestra artículos y notas publicados, igual que `/`. No muestra "Recomendados para ti" ni la barra de crear.
- Los mismos tags se pueden filtrar en la portada con `/?tag=ia`, pero sin controles en pantalla: la interfaz para filtrar es solo `/explore`.

### Mensajes

| Caso | Texto |
| :--- | :--- |
| Con tag elegido y sin resultados | "No hay publicaciones con el tag #x." |
| Sin tag y sin publicaciones | "Todavía no hay publicaciones para explorar." |

## Decisiones y por qué

| Decisión | Alternativas | Consecuencia |
| :--- | :--- | :--- |
| **Los tags se ven solo aquí** ([ADR 0020](../adr/0020-tags-como-metadato-interno.md)) | Mostrarlos en cada tarjeta | Tarjetas limpias. Por qué se decidió así: motivo no registrado † (el ADR 0004 lo llama "regla de producto") |
| **Filtro por URL** (`?tag=`) | Estado en el navegador | Se puede compartir el enlace y funciona sin JavaScript de cliente para filtrar |
| **Chips con todos los tags del catálogo** | Solo tags con posts publicados | Más simple, pero con muchos tags la fila deja de escalar y puede haber chips vacíos |
| **Reutilizar `FeedList` y `getFeedPage`** | Una consulta propia | Comportamiento idéntico al de la portada (paginación de a 20) |
| **Sin búsqueda de texto** | Campo de búsqueda | No existe hoy; el diseño móvil la sugiere |

## Criterios de aceptación

- [ ] `/explore` responde con o sin sesión.
- [ ] Si existe al menos un tag, aparece la fila con `Todos` y un chip `#tag` por cada uno.
- [ ] Elegir un chip filtra el feed y resalta ese chip; `Todos` quita el filtro.
- [ ] Un tag sin publicaciones muestra "No hay publicaciones con el tag #x.".
- [ ] El feed pagina de a 20 con "Cargar más" y vuelve a la primera página al cambiar de tag.
- [ ] Ninguna tarjeta del feed muestra tags.
- [ ] Un valor inválido en `?tag=` (por ejemplo vacío o de más de 50 caracteres) se ignora y no rompe la página.

## Cómo verificarla a mano

1. Con datos de prueba (`pnpm seed:dev`, ver [PRD-X.2](PRD-X.2-dev-tooling.md)) o publicando artículos con tags, abrir `/explore` sin sesión.
2. Pulsar un chip: la URL pasa a `/explore?tag=...` y el feed cambia. Pulsar `Todos`.
3. Escribir a mano `/explore?tag=zzzz`: mensaje de "sin resultados".
4. Escribir `/explore?tag=` (vacío): se comporta como `Todos`.
5. Abrir un post de la portada y confirmar que no muestra tags.
6. Tests relacionados: `pnpm vitest run src/features/posts/schemas.test.ts` (schema del tag y del feed). No hay tests de la página ni e2e para `/explore`.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| El comentario de `src/app/(public)/page.tsx` dice que los tags no se muestran en ninguna parte de la interfaz, y ya no es exacto porque `/explore` los muestra. Corregir el comentario | B |
| Escribir un test e2e de Explorar: elegir un chip, ver el filtro y el mensaje vacío (coordinar con [PRD-X.1](PRD-X.1-testing-e2e.md)) | M |
| Hacer que `getAllTagNames` devuelva solo tags con al menos un post publicado, y evaluar el costo de la consulta | M |
| Un visitante sin sesión no ve la navegación y solo llega a `/explore` por URL. Proponer (solo documento) cómo mostrarle el acceso | B |

## Preguntas de autoevaluación

1. ¿De dónde sale el tag elegido y qué ocurre si la URL trae un tag inválido?
2. ¿Por qué los chips son enlaces y no botones con estado?
3. ¿Para qué sirve el `key` de `FeedList` y qué pasaría si no estuviera?
4. ¿Qué devuelve `getAllTagNames` y por qué puede haber chips sin resultados?
5. ¿Por qué esta es la única pantalla que muestra tags? ¿Está registrado el motivo?
6. ¿Qué hace `Promise.all` aquí y qué ganaríamos o perderíamos pidiéndolo en secuencia?
