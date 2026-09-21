# 0004. Recomendaciones por scoring determinista de tags

- **Estado:** Aceptada (implementada)
- **Fuentes:** [PRD-global](../PRD-global-vision.md) sección 5; [PRD-4](../prds/PRD-4-recommendations.md)

## Contexto

El feed necesita una sección "Recomendados para ti". Es un problema de similitud y ranking, no de generación de texto. La tabla `reading_history` se llena al abrir un artículo (ver [`../db/schema.md`](../db/schema.md)).

## Decisión

La relevancia de un post se calcula comparando sus tags con los de los posts que el usuario ya leyó (`reading_history`). A más tags en común, mayor puntaje. Sin IA generativa. Un usuario sin historial recibe un fallback (posts recientes).

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| LLM para recomendar | Más lento y caro (una llamada por carga de feed) y puede inventar relaciones inexistentes |
| Filtrado colaborativo ("usuarios similares") | Fuera de alcance; solo se usa el historial propio contra atributos del contenido |

## Consecuencias

- **A favor:** consultas en milisegundos, sin costo de tokens, y resultados explicables.
- **En contra:** la calidad depende de la calidad de los tags; sin tags o sin historial el resultado es genérico.
- **Cuándo revisar:** si el volumen de contenido justifica ranking colaborativo o embeddings, o si el catálogo supera la ventana de candidatos (ver más abajo).

## Implementación

Código en `src/features/recommendations/`; no requiere migraciones.

- **Ranking en TypeScript, no en SQL.** `scoreByTags.ts` es puro (`buildTagProfile` y `rankCandidates`) y se prueba con Vitest sin base de datos. `queries.ts` solo trae datos y llama a esas funciones.
- **Puntaje:** cantidad de tags en común entre el conjunto de tags de lo leído y los tags del candidato (cada tag cuenta una vez). Se ordena por puntaje, luego `published_at` descendente y por último `id`.
- **Fallback unificado:** todos los candidatos se puntúan; sin historial todos valen 0 y queda el orden por fecha, y si hay menos de 10 con puntaje mayor a cero el resto se completa con los más recientes. No hay una rama aparte.
- **Candidatos:** artículos publicados (`type = 'article'`), no leídos y que no son del propio usuario. Las lecturas de artículos propios tampoco cuentan para el perfil de tags (el PRD no lo define; abrir tu propio artículo para editarlo no expresa interés).
- **Consultas:** historial (con los tags de cada post) y candidatos en paralelo, y una tercera consulta con los 10 ganadores para armar las tarjetas. Todo corre con el cliente del usuario, así que RLS aplica.
- **Límites:** ventana de 200 artículos publicados más recientes (`CANDIDATE_WINDOW`) y 1000 lecturas (`HISTORY_LIMIT`), en `constants.ts`. Un artículo fuera de la ventana no se recomienda. Si el catálogo la supera, el siguiente paso es mover el ranking a una función SQL `security invoker` (respeta RLS sin recibir el id de usuario como parámetro).
- **Errores:** `getRecommendedPosts` nunca lanza; ante un fallo registra el error y devuelve una lista vacía, y la sección no se muestra. Va dentro de `<Suspense>` para no bloquear el feed.
- **Visibilidad:** solo para usuarios con sesión y sin filtro `?tag=`. No se muestran tags (regla de producto).
