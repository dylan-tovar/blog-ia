# 0030. Descubrimiento: 3ra columna con búsqueda, sugeridos para seguir y temas

- **Estado:** Aceptada. Actualiza parcialmente el [ADR 0020](0020-tags-como-metadato-interno.md): los tags dejan de ser exclusivos de `/explore` y del onboarding, y se exponen también como una barra de intereses editable en la 3ra columna.
- **Fecha:** 2026-09-22
- **Fuentes:** [ADR 0004](0004-recomendaciones-scoring-determinista.md) (scoring determinista), [ADR 0025](0025-intereses-en-onboarding.md) (intereses de onboarding), [ADR 0026](0026-feed-de-seguidos-con-recomendados.md) (follow + recomendados); `src/features/recommendations/scoreByTags.ts`, `src/features/discovery/scoreAuthorsByTags.ts`, `src/features/discovery/queries.ts`, `src/features/interests/actions.ts`, `src/components/shared/AppShell.tsx`, `src/components/shared/RightRail.tsx`

## Contexto

El feed ya tiene follow/recomendados (ADR 0026) e intereses de onboarding (ADR 0025), pero no hay ninguna forma de buscar gente, publicaciones o temas en toda la app, ningún widget de "gente sugerida" fuera de las tarjetas del feed, y los intereses solo se editan una vez, en el onboarding. El layout es una sola columna centrada (`max-w-2xl`) en todos los tamaños: nunca hubo una columna lateral.

## Decisión

Se agrega una 3ra columna, solo en pantallas anchas (`lg:`, 1024px+), con búsqueda, gente sugerida para seguir y una barra de temas para afinar recomendaciones. En mobile no se pierde nada: la búsqueda se dispara desde un ícono nuevo en el header y "sugeridos para seguir" se agrega también en `/explore`.

### Layout de 3 columnas

`AppShell` envuelve `<main>` (sin tocar sus clases existentes) en un grid que solo activa `lg:` y agrega `<aside>` con `<RightRail>`, sticky y con scroll propio. Por debajo de `lg:` el grid no aplica: cero riesgo de regresión en mobile/tablet.

### Sugeridos para seguir

Pool de autores más seguidos (función SQL `popular_authors`, excluye al viewer y a quien ya sigue) reordenado por afinidad de tags con el perfil del viewer: misma lógica de `scoreByTags.ts` (`buildTagProfile`/`withInterestTags`, reusados sin fork), extendida a autores en `scoreAuthorsByTags.ts` (`rankAuthorsByAffinity`). Desempate por `follower_count` desc y luego `author_id` asc. Sin señal de tags, el resultado degrada al orden de popularidad puro: no es un branch especial, es la consecuencia natural de un score en 0 para todos los candidatos. El mismo componente server (`SuggestedPeopleWidget`) se reusa en la 3ra columna y en `/explore`, para que mobile no pierda la función.

### Búsqueda v1: ILIKE simple

`searchAll(query, viewerId)` corre tres queries ILIKE en paralelo: `username`/`display_name` (personas), `title` de publicaciones tipo artículo publicadas (publicaciones), `name` (temas). Sin `pg_trgm` ni `tsvector`: a este volumen de datos un ILIKE con índice `lower(...)` alcanza. Se documenta como punto a revisar si el volumen lo justifica (ver "Cuándo revisar"). El `%`/`_` del input se sanitiza antes de interpolar en el patrón.

Un ícono **nuevo** en el header abre el modal de búsqueda (`SearchModal`, `Dialog` en `lg:+`, `Drawer` en mobile, según `useIsDesktop`); el ícono de lupa existente sigue linkeando a `/explore` sin cambios, así que no se pierde el acceso a explorar temas en mobile.

### Barra de temas como interés, editable fuera del onboarding

El sidebar reutiliza `getInterestOptions`/`getUserInterestIds`, pero `saveInterests` redirige a `/onboarding` o `/` según `profile.onboarded_at`, así que no se puede llamar tal cual después del onboarding. Se extrae el diff/upsert/delete de `actions.ts` a un helper compartido (`applyInterestChanges`) y se agrega `updateInterests(tagIds)`, sin redirect, para el sidebar; `saveInterests` no cambia su contrato.

### Algoritmo de sugeridos: determinista, sin ML

Popularidad + afinidad por tags, mismo espíritu que [ADR 0004](0004-recomendaciones-scoring-determinista.md) y [ADR 0026](0026-feed-de-seguidos-con-recomendados.md): sin modelo, sin señales externas, el mismo input siempre da el mismo orden.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| `pg_trgm`/`tsvector` para la búsqueda | Mayor complejidad de infraestructura para un volumen de datos que hoy no lo justifica; ILIKE con índice alcanza |
| Un solo ícono de búsqueda que reemplace el link a `/explore` | Mobile perdería el acceso directo a explorar temas; se agrega un ícono nuevo en cambio |
| Mostrar sugeridos solo en la 3ra columna (sin tocar `/explore`) | Mobile (sin columna lateral) se quedaría sin la función |
| Forkear `buildTagProfile`/`withInterestTags` para autores | Duplicaría lógica ya probada; se extiende con una función nueva (`rankAuthorsByAffinity`) que reusa las mismas piezas |
| Un branch especial para "sin tags → popularidad" | Innecesario: con `tagIds` vacío el score es 0 para todos los candidatos y el orden que queda es el de entrada (popularidad) |

## Consecuencias

- **A favor:** descubrimiento (buscar, seguir, afinar intereses) queda disponible en toda la app sin depender de `/explore`; se reusa el scoring y las queries existentes; sin riesgo de regresión en mobile/tablet.
- **En contra:** la búsqueda ILIKE no tiene relevancia semántica ni tolera errores de tipeo; el pool de sugeridos depende de `popular_authors`, que solo incluye autores con al menos un seguidor (un autor sin seguidores no aparece nunca en el pool, aunque tenga afinidad de tags alta).
- **Cuándo revisar:** si el volumen de perfiles/publicaciones crece lo suficiente para que el ILIKE con índice deje de alcanzar, migrar a `pg_trgm` o `tsvector`; si se quiere que autores sin seguidores aparezcan en sugeridos, cambiar el join de `popular_authors` a uno externo (`left join`).
