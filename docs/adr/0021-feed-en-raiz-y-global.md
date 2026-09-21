# 0021. El feed es la página de inicio (`/`) y es un feed global

- **Estado:** Aceptada. **El motivo de mover el feed de `/feed` a `/` no quedó registrado**, y tampoco el de que el feed no filtre por seguidos: solo consta que el diseño original de PRD-3 lo dejaba fuera del mínimo. Reemplazada parcialmente por el [ADR 0026](0026-feed-de-seguidos-con-recomendados.md) (ver la actualización al final).
- **Fecha:** 2026-09-20 (documenta un estado existente)
- **Fuentes:** [PRD-3](../prds/PRD-3-feed-follows.md) (sección «Alcance / fuera de alcance»), [PRD-4](../prds/PRD-4-recommendations.md), [ADR 0008](0008-tema-oscuro-y-shell-de-aplicacion.md), `src/app/(public)/page.tsx`, `src/features/auth/actions.ts`, `src/features/posts/queries.ts`

## Contexto

El diseño original de PRD-1 a PRD-4 preveía una ruta `/feed`: el login redirigía allí, la sección de recomendaciones vivía allí y el feed era una página privada del usuario. Los PRDs actuales ya describen `/` y solo dicen que `/feed` devuelve 404. El producto quedó con una interfaz tipo app móvil donde la primera pantalla es el contenido ([ADR 0008](0008-tema-oscuro-y-shell-de-aplicacion.md)).

## Decisión

- **El feed vive en `/`** (`src/app/(public)/page.tsx`), es público y se ve con o sin sesión. La ruta `/feed` **no existe** y responde 404.
- **El registro y el inicio de sesión redirigen a `/`**; el cierre de sesión va a `/login` (como pide PRD-1).
- **Es un feed global cronológico**, con "Cargar más" en páginas de 20 (`FEED_PAGE_SIZE`). No hay un feed "solo de quienes sigo": el diseño original de PRD-3 lo dejaba fuera del mínimo y el porqué de mantenerlo así no quedó registrado. Seguir a un autor hoy solo alimenta el contador de seguidores y el estado del botón "Seguir"; no cambia lo que se ve en `/`.
- **Con sesión**, arriba del feed aparecen la barra "¿Qué estás pensando?", el menú "Crear" y, si no hay filtro `?tag=`, la sección "Recomendados para ti" ([ADR 0004](0004-recomendaciones-scoring-determinista.md)) dentro de un `<Suspense>` para no bloquear el feed.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Mantener `/feed` como ruta privada | No registrada la razón del cambio |
| Feed "solo de quienes sigo" | Quedó fuera del mínimo del diseño original de PRD-3; el motivo no quedó registrado (el feed global cubre el descubrimiento †) |
| Notificaciones o feed de actividad de seguidos | Quedó fuera del alcance de PRD-3; `/activity` existe solo como pantalla vacía ([PRD-9](../prds/PRD-9-explore-activity.md)) |

## Consecuencias

- **A favor:** un visitante anónimo ve contenido al entrar; una sola ruta para "inicio".
- **En contra:** seguir a alguien no tiene efecto visible en el contenido; los PRDs de la época original hablaban de `/feed` y los documentos o marcadores viejos pueden seguir citándolo; una URL `/feed` guardada da 404.
- **Cuándo revisar:** al agregar un feed filtrado por seguidos (decidir si reemplaza o convive con el global) o notificaciones reales en `/activity`.

## Actualización (2026-09-21)

Reemplazada parcialmente por el [ADR 0026](0026-feed-de-seguidos-con-recomendados.md): con sesión, sin filtro `?tag=` y siguiendo al menos a un autor, `/` muestra solo los posts de quienes seguís (más los propios) con recomendados intercalados cada 3 posts y etiquetados "Recomendado", y ya no muestra el carrusel. En cualquier otro caso (visitante, sin seguidos o con `?tag=`) el feed sigue siendo global, y `/explore` no cambia. Lo que sigue vigente de este ADR: el feed vive en `/` y `/feed` da 404.
