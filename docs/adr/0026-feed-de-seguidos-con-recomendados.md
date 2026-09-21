# 0026. El inicio muestra a quienes seguís, con recomendados intercalados

- **Estado:** Aceptada. Reemplaza parcialmente el [ADR 0021](0021-feed-en-raiz-y-global.md): el feed de `/` deja de ser siempre global cuando la persona tiene sesión y sigue a alguien. El resto del 0021 (el feed vive en `/`, `/feed` da 404) sigue vigente.
- **Fecha:** 2026-09-21
- **Fuentes:** [PRD-3](../prds/PRD-3-feed-follows.md), [PRD-3.2](../prds/PRD-3.2-feed-list.md), [PRD-4.2](../prds/PRD-4.2-recs-query-ui.md), [ADR 0004](0004-recomendaciones-scoring-determinista.md), [ADR 0021](0021-feed-en-raiz-y-global.md); `src/app/(public)/page.tsx`, `src/features/posts/queries.ts` (`getFeedPage`, `getFeedPostsByIds`), `src/features/posts/interleave.ts`, `src/features/posts/components/FeedList.tsx`, `PostCard.tsx`, `src/features/recommendations/queries.ts` (`getRecommendedPostIds`), `src/features/subscriptions/queries.ts` (`getAllFollowedAuthorIds`)

## Contexto

Con el ADR 0021, seguir a un autor no cambiaba nada de lo que se ve en `/`: solo alimentaba el contador y el botón "Seguir". Las recomendaciones vivían aparte, en un carrusel horizontal arriba del feed, con un formato reducido (`{ id, title, excerpt, author }`, solo artículos). Se quiere que seguir tenga un efecto visible y que el descubrimiento no se pierda.

## Decisión

Con sesión, sin filtro `?tag=` y siguiendo al menos a un autor, `/` pasa a **modo "siguiendo"**:

- **Solo posts de quienes seguís, más los propios.** `getFeedPage({ scope: "following" })` resuelve en el servidor quién es la persona (`getViewer`) y a quién sigue (`getAllFollowedAuthorIds`), y filtra con `.in("author_id", [...seguidos, viewer.id])`. **El cliente nunca manda ids**: `feedQuerySchema` solo acepta `scope: "global" | "following"` (por defecto `"global"`) y descarta cualquier otro campo. Sin sesión o sin seguidos devuelve una página vacía.
- **Recomendados intercalados, uno cada 3 posts.** `getRecommendedPostIds` reutiliza el ranking de [ADR 0004](0004-recomendaciones-scoring-determinista.md) (`rankCandidates`) excluyendo a los autores seguidos y pide un pool finito (`FEED_RECOMMENDATIONS_LIMIT = 15`) una sola vez en la primera carga; `getFeedPostsByIds` los trae con el mismo formato de tarjeta que el feed. La función pura `interleaveRecommended` los intercala **al renderizar** sobre la lista concatenada (primera página + "Cargar más"): el patrón no se reinicia con cada página y el `offset` cuenta solo posts del feed. Cuando el pool se agota no se inserta más. Si un recomendado ya está en el feed se descarta.
- **Cada recomendado lleva la etiqueta "Recomendado"** en el encabezado de la tarjeta, junto a la fecha (`PostCard`, con el `Badge` de `components/ui`).
- **En modo "siguiendo" no hay carrusel.** Las recomendaciones pasan a estar dentro del feed.
- **Todo lo demás queda igual.** Sin sesión, sin seguidos o con `?tag=` el feed es global y el carrusel "Recomendados para ti" se comporta como antes ([PRD-4.2](../prds/PRD-4.2-recs-query-ui.md)); `/explore` usa el scope `"global"` por defecto y no cambia. Copia del estado vacío del modo nuevo: "Las personas que seguís todavía no publicaron nada."

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Excluir los posts propios del feed de seguidos | Una nota recién publicada desaparecería de la portada |
| Aplicar el modo "siguiendo" también con `?tag=` | El tag es una exploración explícita; las recomendaciones ya lo respetaban así |
| Intercalar en el servidor, dentro de la consulta | El patrón se reiniciaría con cada página de "Cargar más" y el `offset` mezclaría posts del feed con recomendados |
| Paginar también los recomendados | Un segundo eje de paginación para un pool chico; se prefiere un pool finito que se agota |
| Etiqueta "Para ti" | Es el nombre de un feed, no la naturaleza de un post; "Recomendado" es literal |
| Reemplazar también el carrusel para quien no sigue a nadie | Es el caso de arranque en frío: se deja como estaba para no agregar interfaz nueva ni riesgo |
| Mover el filtro a una función SQL (RPC) | Innecesario a este volumen; ver "Cuándo revisar" |

## Consecuencias

- **A favor:** seguir a alguien tiene efecto visible; las recomendaciones se descubren dentro del flujo; sin migración; el ranking se reutiliza tal cual.
- **En contra:** la portada hace una consulta extra por carga (los ids de seguidos, además de la que hace `getFeedPage`); quien sigue a pocos autores ve un feed corto y solo después de 3 posts empiezan los recomendados; los recomendados son un pool de 15, así que un feed muy largo deja de intercalarlos; se pierde el carrusel para quien sigue a alguien.
- **Cuándo revisar:** si los seguidos por persona crecen tanto que `.in("author_id", ids)` supere el largo de URL permitido, pasar el filtro a una función SQL (RPC); si el pool de 15 se agota seguido, paginar los recomendados o subir el límite.
