# PRD-4.2 — Consulta y sección "Recomendados para ti"

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-4 — Recomendaciones](PRD-4-recommendations.md) |
| Dificultad / Esfuerzo | B (básica) / S (hasta 1 día) |
| Dueño sugerido / Mentor | D4 / D2 |
| Depende de | [PRD-4.1](PRD-4.1-scoring-core.md) (`buildTagProfile`, `rankCandidates`), [PRD-3.2](PRD-3.2-feed-list.md) (la página `/` que la contiene) |
| Código | `src/features/recommendations/queries.ts`, `src/features/recommendations/components/RecommendedSection.tsx`, `RecommendedCard.tsx`, `RecommendedSkeleton.tsx`, `row-styles.ts`; integración en `src/app/(public)/page.tsx` |
| ADRs | [0004](../adr/0004-recomendaciones-scoring-determinista.md) |

## Resumen

Conecta el ranking ([4.1](PRD-4.1-scoring-core.md)) con la base de datos y con la pantalla: pide el historial de lectura y los artículos candidatos, calcula el ranking y dibuja una fila horizontal desplazable de tarjetas arriba del feed. La regla de oro: **si algo falla, la sección simplemente no aparece**; nunca rompe la portada.

## Qué necesitás entender antes

- [ ] Server Components `async` y **`Suspense`**: mostrar un "esqueleto" mientras un componente espera datos.
- [ ] Qué es una **promesa** que se pasa como prop (`postsPromise`) y se espera dentro de un componente.
- [ ] `try/catch` y devolver un valor por defecto (`[]`) en vez de propagar el error.
- [ ] Consultas de Supabase con relaciones embebidas (`select("post_id, posts(author_id, post_tags(tag_id))")`).
- [ ] Clases de Tailwind para una fila desplazable (`overflow-x-auto`, `snap-x`).
- [ ] Glosario: [docs/README.md](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `getRecommendedPosts` y las 3 consultas | La fórmula del ranking: [PRD-4.1](PRD-4.1-scoring-core.md) |
| `RecommendedSection`, `RecommendedCard`, `RecommendedSkeleton` | El resto de la portada y el feed: [PRD-3.2](PRD-3.2-feed-list.md) |
| Cuándo se muestra la sección | Registrar lecturas (`recordRead`): [PRD-2.6](PRD-2.6-post-detail.md) |

## Cómo funciona

Orden de lectura: `queries.ts` (de abajo hacia arriba: `getRecommendedPosts` → `loadRecommendations`) → `RecommendedSkeleton` → `RecommendedSection` → `RecommendedCard` → el uso en `page.tsx`.

### 1. Las consultas (`loadRecommendations(viewerId)`)

```text
en paralelo (Promise.all):
  historial  = últimas 1000 filas de reading_history del usuario, con author_id y tags de cada post
  candidatos = 200 artículos published (type = 'article') más recientes de OTROS autores, con sus tags
si alguna falla -> lanza Error
perfil  = buildTagProfile(historial, viewerId)                 # 4.1
ranking = rankCandidates({ ..., limit: 10 })                   # 4.1
si el ranking está vacío -> []
hidratar: una 3ª consulta trae título, contenido y autor de esos 10 ids
devolver { id, title, excerpt, author } en el orden del ranking
```

`getRecommendedPosts` envuelve todo en `try/catch`: ante cualquier error hace `console.error` y devuelve `[]`. Por eso su promesa **nunca se rechaza**, y `RecommendedSection` puede esperarla sin manejar errores.

### 2. La sección

- `page.tsx` solo pide recomendados si hay sesión **y** no hay filtro `?tag=`. Guarda la promesa **sin esperarla** y se la pasa a `RecommendedSection` dentro de `<Suspense fallback={<RecommendedSkeleton />}>`: el feed no espera a las recomendaciones.
- `RecommendedSection` es un Server Component `async`: `await postsPromise`; si la lista está vacía devuelve `null` (no dibuja nada, ni título); si no, un `<section>` con el título "Recomendados para ti" y una lista horizontal.
- `RecommendedCard`: un `Link` a `/post/<id>` con autor, título (dos líneas máximo) y extracto.
- `RecommendedSkeleton`: 3 rectángulos animados (`animate-pulse`) con la misma forma que las tarjetas.
- `row-styles.ts` guarda las clases compartidas de la fila (`RECOMMENDED_ROW_CLASS`: desplazamiento horizontal con "snap") y del ítem (`w-[min(78%,17rem)]`).

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| Calcular en TypeScript sobre una ventana acotada, con 3 consultas simples | Una función pura fácil de probar; descartar SQL con agregación o una vista materializada es † (razón no registrada). Costo: no se ven artículos fuera de los 200 más recientes |
| Recalcular en cada visita a `/`, sin caché | Refleja la última lectura sin invalidar nada †. Costo: tres consultas por carga (mitigado con `Suspense`) |
| Nunca propagar errores | Un fallo del cálculo no debe romper la portada |
| Solo artículos publicados de otros | Las notas no tienen tags; los propios no aportan |
| No mostrar la sección con un filtro de tag activo | El usuario ya está viendo un subconjunto elegido †; el motivo no quedó registrado |

## Criterios de aceptación

- [ ] Sin sesión, o con `?tag=` activo, la sección no aparece.
- [ ] Con sesión y sin historial, aparecen artículos recientes de otros autores.
- [ ] Un artículo ya leído o propio no aparece.
- [ ] Si la consulta falla (por ejemplo, base caída), la portada se muestra igual, sin la sección.
- [ ] Mientras carga se ve el esqueleto; la fila se desplaza horizontalmente con "snap" en móvil.
- [ ] Cada tarjeta lleva a `/post/<id>`.

## Cómo verificarla a mano

1. `pnpm seed:dev` ([PRD-X.2](PRD-X.2-dev-tooling.md)), iniciá sesión con un usuario del seed y abrí `/`: debe verse "Recomendados para ti".
2. Abrí `/?tag=ia`: la sección desaparece.
3. Abrí un artículo, volvé a `/` y comprobá que ese artículo ya no está entre los recomendados.
4. Simulá un fallo: cambiá temporalmente el nombre de una columna en `queries.ts`, recargá `/` (la portada debe verse **sin** la sección y el error sólo en la consola del servidor) y revertí el cambio.
5. En las herramientas del navegador, achicá la ventana y comprobá el desplazamiento horizontal.
6. No hay test e2e de esta sección ([PRD-X.1](PRD-X.1-testing-e2e.md)); el ranking se prueba en [PRD-4.1](PRD-4.1-scoring-core.md).

## Trabajo pendiente asignable

| Tarea | Dif. |
| :--- | :--- |
| Agregar un e2e: un usuario que lee un artículo con un tag ve recomendado otro artículo con ese tag | M |
| La sección desaparece sin explicación cuando no hay resultados: evaluar un mensaje o dejar el comportamiento actual (decisión de producto) | B |
| `RecommendedCard` no muestra la fecha ni el tiempo de lectura: agregarlos | B |
| Cachear el resultado por sesión (`unstable_cache` o similar) para no hacer 3 consultas por visita | A |
| Convertir la comprobación de `queries.ts` en tests con un cliente de Supabase simulado | A |

## Preguntas de autoevaluación

1. ¿Por qué `getRecommendedPosts` nunca lanza un error hacia arriba?
2. ¿Qué hace `Suspense` en `page.tsx` y qué vería el usuario sin él?
3. ¿Por qué la promesa se crea en `page.tsx` **antes** de esperar el feed?
4. ¿Por qué se hace una tercera consulta para "hidratar" en vez de traer título y contenido con los candidatos?
5. ¿En qué casos la sección no se muestra?
6. ¿Qué límites tiene el ranking por trabajar con una ventana de 200 artículos?
