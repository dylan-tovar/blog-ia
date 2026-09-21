# PRD-4.1 — Núcleo del ranking por tags (`scoreByTags`)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-4 — Recomendaciones](PRD-4-recommendations.md) |
| Dificultad / Esfuerzo | M (media) / M (2-3 días) |
| Dueño sugerido / Mentor | D2 / — |
| Depende de | Nada de código: es una función pura. Conceptualmente, los datos de [PRD-3](PRD-3-feed-follows.md) (`reading_history`) y [PRD-2.4](PRD-2.4-publish-dialog-tags.md) (tags) |
| Lo usa | [PRD-4.2](PRD-4.2-recs-query-ui.md) (la consulta y la interfaz) |
| Código | `src/features/recommendations/scoreByTags.ts` (incluye `withInterestTags`), `scoreByTags.test.ts`, `constants.ts` |
| ADRs | [0004](../adr/0004-recomendaciones-scoring-determinista.md) |

## Resumen

El "cerebro" de "Recomendados para ti": dos funciones **puras** (sin base de datos, sin red) que reciben datos ya cargados y devuelven qué artículos recomendar. Un artículo puntúa más cuantos más **tags comparte** con lo que la persona ya leyó. No usa IA: es una cuenta simple, explicable y testeable. Que sea pura es lo que permite probarla a fondo con tests rápidos.

## Qué necesitás entender antes

- [ ] Qué es una **función pura**: mismo input → mismo output, sin efectos secundarios.
- [ ] `Set` y `Map` de JavaScript; `Array.filter`, `map`, `sort`, `slice`.
- [ ] Cómo funciona `sort` con un comparador (`(a, b) => número`), incluido el desempate en cadena con `||`.
- [ ] Qué es un test unitario con `vitest` (`describe`, `it`, `expect`).
- [ ] El modelo de datos: un post tiene varios tags (`post_tags`); `reading_history` guarda qué leyó cada usuario ([PRD-3](PRD-3-feed-follows.md)).
- [ ] Por qué se decidió no usar IA generativa aquí ([ADR 0004](../adr/0004-recomendaciones-scoring-determinista.md)).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `buildTagProfile` y `rankCandidates` | Traer los datos de la base y la interfaz: [PRD-4.2](PRD-4.2-recs-query-ui.md) |
| Las constantes `RECOMMENDATIONS_LIMIT`, `CANDIDATE_WINDOW`, `HISTORY_LIMIT` | Recomendar por afinidad social ("quien te sigue") o con ponderación por frecuencia (no existe) |
| Los tests de `scoreByTags.test.ts` | Registrar lecturas (`ReadTracker`): [PRD-2.6](PRD-2.6-post-detail.md) |

## Cómo funciona

Orden de lectura: `constants.ts` → `scoreByTags.ts` (de arriba abajo) → `scoreByTags.test.ts` (los tests son la mejor especificación).

### 1. Constantes

| Constante | Valor | Para qué |
| :--- | :--- | :--- |
| `RECOMMENDATIONS_LIMIT` | 10 | Cuántos recomendados se muestran |
| `CANDIDATE_WINDOW` | 200 | Cuántos artículos recientes se puntúan (los que trae [4.2](PRD-4.2-recs-query-ui.md)) |
| `HISTORY_LIMIT` | 1000 | Cuántas lecturas recientes se consideran (idem) |

### 2. `buildTagProfile(history, viewerId)`

Recorre el historial de lecturas y devuelve dos conjuntos:

- `readPostIds`: los ids de **todos** los posts que el usuario leyó (para no recomendárselos de nuevo).
- `tagIds`: la **unión** de los tags de los posts leídos. Se ignoran los tags de posts **propios** (aunque igual quedan como "leídos") y de posts que ya no son visibles (`posts` viene `null`).

Un tag cuenta **una sola vez** aunque haya sido leído en 50 artículos: es un conjunto (`Set`), no un contador.

### 2b. `withInterestTags(tagIds, interestTagIds)`

Une el perfil leído con los tags de los temas de interés que el usuario eligió en el onboarding ([ADR 0025](../adr/0025-intereses-en-onboarding.md)) y **devuelve un `Set` nuevo** (no muta el de entrada). Un interés cuenta igual que un tag leído, y un tag que está en ambos cuenta una sola vez. Con ella un usuario sin historial pero con intereses tiene un perfil no vacío.

### 3. `rankCandidates({ tagIds, readPostIds, candidates, viewerId, limit })`

```text
candidates
  .filtrar( autor != yo  Y  no leído )
  .map( score = cantidad de tags DISTINTOS del candidato que están en tagIds )
  .ordenar( score descendente, luego published_at descendente, luego id )
  .primeros(limit)
```

Detalles que importan:

- El **desempate** en cadena: primero el puntaje; si empatan, el más reciente (`compareByRecency`); si empatan las fechas (o no tienen), el `id` (así el orden es **estable** entre ejecuciones).
- Un post **sin fecha** de publicación se considera el más viejo (`Number.NEGATIVE_INFINITY`).
- Si el usuario **no tiene historial ni intereses**, todos puntúan 0 y el desempate por recencia devuelve los más nuevos: el "plan B" ocurre **de forma implícita**, no hay una rama especial.
- Los candidatos con puntaje 0 también entran si sobra lugar, para que la sección no quede vacía sin necesidad.
- No muta los datos que recibe (lo verifica un test).

### 4. Cómo leer los tests

`scoreByTags.test.ts` tiene un `describe` por función. Ejemplos de lo que documentan: "returns the most recent posts when the user has no history", "never returns a post the user already read", "never returns the viewer's own posts", "breaks score ties by published_at descending", "sorts posts without a publication date last", "does not mutate the candidates it receives". Cada `it` es una regla de negocio en una línea.

## Decisiones y por qué

| Decisión | Alternativas | Por qué |
| :--- | :--- | :--- |
| Ranking determinista, sin IA ([ADR 0004](../adr/0004-recomendaciones-scoring-determinista.md)) | Que un LLM recomiende | Es un problema de ranking por atributos, no de generación de texto: rápido, gratis por carga, 100 % explicable |
| Puntaje = tags **distintos** en común | Ponderar por frecuencia o recencia de lectura | Simple y explicable †; se puede refinar después |
| Funciones puras separadas de la consulta | Todo en una función que consulta y calcula | Se prueban sin base de datos (consta en el diseño de `queries.ts`/`scoreByTags.ts`) |
| Excluir lo leído y lo propio | Mostrar todo | Recomendar lo que ya leíste o escribiste no aporta † |
| Ventana acotada de candidatos e historial | Todo el catálogo | Limita el costo de cada visita a `/`; contrapartida: un artículo viejo relevante nunca aparece |

## Criterios de aceptación

- [ ] Sin historial ni intereses, devuelve los artículos más recientes de otros autores.
- [ ] `withInterestTags` une intereses e historial sin duplicar y sin mutar el conjunto de entrada; un usuario solo con intereses recibe un ranking personalizado.
- [ ] Con historial, los artículos que comparten más tags con lo leído aparecen primero.
- [ ] Nunca devuelve un artículo ya leído ni uno propio.
- [ ] A igual puntaje, el más reciente va primero; a igual fecha, el orden por `id` es estable.
- [ ] Devuelve como máximo `limit` elementos y no modifica los arrays de entrada.
- [ ] Todos los tests de `scoreByTags.test.ts` pasan con `pnpm test`.

## Cómo verificarla a mano

1. `pnpm test src/features/recommendations` y comprobá que pasan (`pnpm vitest run` acepta rutas).
2. Abrí `scoreByTags.test.ts`, elegí un test (por ejemplo "breaks score ties by published_at descending") y **rompé el código a propósito** (invertí el `>` en `compareByRecency`): el test debe fallar. Volvé a dejarlo bien.
3. En `pnpm dev`, con dos usuarios del seed, leé un artículo con un tag y mirá qué artículos con el mismo tag suben en "Recomendados para ti" ([PRD-4.2](PRD-4.2-recs-query-ui.md)).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Ponderar tags por cuántas veces se leyeron (hoy pesan igual) y actualizar los tests primero (TDD) | A |
| Test que documente el orden cuando **todos** los candidatos tienen `published_at` nulo | B |
| Explicar el porqué de cada recomendación ("porque leíste sobre X"): los tags son invisibles para lectores ([ADR 0020](../adr/0020-tags-como-metadato-interno.md)), así que primero hay que decidir si eso cambia | A |
| Sumar la señal de "sigo al autor" al puntaje (la afinidad social hoy no influye) | M |

## Preguntas de autoevaluación

1. ¿Qué significa que `rankCandidates` sea una función pura y qué ventaja da eso para probarla?
2. ¿Por qué un tag leído 50 veces vale lo mismo que uno leído una vez?
3. ¿Cómo se comporta el ranking para un usuario sin historial ni intereses? ¿Dónde está el código de ese "plan B"?
4. Explicá el orden de desempate y por qué hace falta comparar por `id` al final.
5. ¿Por qué se ignoran los tags de los artículos que el propio usuario escribió?
6. ¿Por qué se descartó usar IA generativa para esto?
