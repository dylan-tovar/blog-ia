# 0020. Los tags son metadato interno: solo el autor los ve al publicar y Explorar los usa para filtrar

- **Estado:** Aceptada. **El motivo de producto no quedó registrado**: la decisión figuraba como "regla de producto" (ver la sección Implementación de [ADR 0004](0004-recomendaciones-scoring-determinista.md)) sin explicación. Si se conoce el motivo original, conviene agregarlo aquí.
- **Fecha:** 2026-09-20 (documenta un estado existente)
- **Fuentes:** [ADR 0004](0004-recomendaciones-scoring-determinista.md) (visibilidad), [PRD-3](../prds/PRD-3-feed-follows.md), [PRD-4](../prds/PRD-4-recommendations.md), [PRD-5](../prds/PRD-5-ai-author.md), `src/app/(public)/page.tsx`, `src/app/(public)/explore/page.tsx`, `src/features/posts/components/editor/PublishDialog.tsx`, `src/features/posts/queries.ts`

## Contexto

Los tags existen en el modelo (`tags`, `post_tags`) por dos razones de producto: el motor de recomendaciones compara tags con el historial ([ADR 0004](0004-recomendaciones-scoring-determinista.md)) y la moderación de IA sugiere tags al publicar ([ADR 0011](0011-ia-con-gemini.md)). PRD-3 pedía además que el feed pudiera filtrarse por tag.

## Decisión

Los tags se guardan y se usan por dentro, pero **no se muestran a los lectores** en las tarjetas, en el post ni en el perfil del autor.

| Dónde | Qué pasa con los tags |
| :--- | :--- |
| Tarjetas del feed, página del post, perfil del autor | No se muestran; las consultas de lectura de tarjetas ya no los piden |
| Diálogo "Continuar" del editor (`PublishDialog`) | El autor los ve, los agrega, los quita y revisa los que sugiere la IA (máximo 8 por post, hasta 5 de la IA) |
| `/explore` | Única superficie pública: una fila de chips `#tag` que filtra el feed con `?tag=` |
| `/?tag=x` en el feed de inicio | El filtro sigue funcionando por URL, sin controles en pantalla |
| Recomendaciones | Usan los tags por dentro; la sección "Recomendados para ti" no los muestra |

Consecuencia sobre el código: `src/app/(public)/page.tsx` contiene el comentario "Tags are not shown anywhere in the UI", que **ya no es exacto**: `/explore` los muestra como chips.

## Alternativas consideradas

| Alternativa | Estado |
| :--- | :--- |
| Mostrar tags como chips en cada tarjeta y post | No registrada la razón por la que se descartó |
| No guardar tags y recomendar por otro medio | Descartada por [ADR 0004](0004-recomendaciones-scoring-determinista.md): el scoring por tags es el motor elegido |

## Consecuencias

- **A favor:** las tarjetas quedan limpias; los tags siguen alimentando recomendaciones y moderación sin ocupar espacio.
- **En contra:** los lectores no pueden descubrir un tag desde un artículo (solo desde `/explore`); PRD-3 promete un filtro por tag que en la práctica vive solo en `/explore` y en la URL.
- **Cuándo revisar:** si se quiere navegación por tags desde el contenido, o si el catálogo de tags crece lo suficiente como para que la fila de chips de `/explore` deje de escalar (hoy `getAllTagNames` los trae todos).
