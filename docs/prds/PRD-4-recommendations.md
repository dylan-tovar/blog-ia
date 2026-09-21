# PRD 4 — Motor de recomendaciones (scoring por tags, sin IA)

| Campo | Valor |
| :--- | :--- |
| Estado | Implementado. Sin cambios de base de datos propios: desde el [ADR 0025](../adr/0025-intereses-en-onboarding.md) también lee `user_interests` (migración `0010`, de [PRD-1](PRD-1-auth.md)) |
| Depende de | [PRD 2](PRD-2-posts.md) (posts y tags), [PRD 3](PRD-3-feed-follows.md) (`reading_history`); filtra por tipo según [PRD 7](PRD-7-notes-likes.md) |
| Migraciones | Ninguna propia (consume `0002`, `0003`, `0005` y `0010`) |
| ADRs relacionados | [0004](../adr/0004-recomendaciones-scoring-determinista.md), [0025](../adr/0025-intereses-en-onboarding.md) |
| Código | `src/features/recommendations/` (`scoreByTags.ts`, `queries.ts`, `constants.ts`, `components/`), integrado en `src/app/(public)/page.tsx` |

## Paquetes de trabajo

Este PRD se reparte en dos paquetes que una persona puede asumir por separado (ver [reparto de tareas](../team/reparto-de-tareas.md)).

| ID | Paquete | Dificultad | Esfuerzo |
| :--- | :--- | :--- | :--- |
| [4.1](PRD-4.1-scoring-core.md) | Núcleo del ranking por tags (`scoreByTags`) | M | M |
| [4.2](PRD-4.2-recs-query-ui.md) | Consulta y sección "Recomendados para ti" | B | S |

## Resumen

En la portada (`/`), un usuario con sesión ve una sección **"Recomendados para ti"** con hasta 10 artículos ordenados por cuántos **tags comparten con lo que ya leyó y con los temas de interés que eligió en el onboarding**. No usa IA: es un ranking determinista sobre una ventana acotada de datos, calculado en TypeScript en cada visita a `/`.

## Problema y objetivo

* Mostrar recomendaciones basadas en el historial de lectura del propio usuario y en los temas que eligió en el onboarding ([PRD-1](PRD-1-auth.md)).
* Que el cálculo sea **explicable y determinista**: coincidencia de tags entre lo leído y los candidatos.
* Que un usuario sin historial siga viendo algo razonable: si eligió intereses, su ranking ya sale personalizado desde el primer día.
* Que un fallo del cálculo **nunca** rompa el feed.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Sección "Recomendados para ti" en `/` para usuarios con sesión | Filtrado colaborativo ("usuarios similares a ti"): solo se usa el historial propio contra atributos del contenido |
| Solo **artículos** publicados de **otras** personas | Notas (no tienen tags) |
| Ranking por tags en común, desempate por recencia | IA generativa (ver decisiones y [PRD-5](PRD-5-ai-author.md)/[PRD-6](PRD-6-ai-reader.md)) |
| Cálculo en cada carga de `/` | Recálculo con cada scroll, caché entre sesiones, ponderación por frecuencia |

## Cómo funciona

### Cuándo aparece

| Condición | Resultado |
| :--- | :--- |
| Sin sesión | No se muestra |
| Con un filtro `?tag=` activo en `/` | No se muestra |
| El cálculo falla o no hay candidatos | La sección **no se muestra** (no rompe el feed) |
| En cualquier otro caso | Fila horizontal desplazable de tarjetas (autor, título, extracto), cargada con `Suspense` para no bloquear el feed |

### Algoritmo (`loadRecommendations` + `scoreByTags.ts`)

```text
en paralelo:
  historial  = últimas 1000 lecturas del usuario (reading_history, con los tags de cada post)
  candidatos = 200 artículos publicados más recientes de OTROS autores (con sus tags)
  intereses  = tag_id de user_interests del usuario (los que eligió en el onboarding)

perfil = conjunto de tag_id de los posts leídos,
         ignorando los posts de los que el propio usuario es autor,
         unido con los tag_id de los intereses (withInterestTags)
leídos = ids de posts ya leídos

para cada candidato que no esté en "leídos" y no sea del propio usuario:
  score = cantidad de tags DISTINTOS del candidato que están en el perfil

ordenar por score descendente; desempate por published_at descendente; luego por id
tomar los primeros 10 (RECOMMENDATIONS_LIMIT)
hidratar esos 10 (título, extracto, autor) con una tercera consulta
```

| Constante (`constants.ts`) | Valor | Para qué |
| :--- | :--- | :--- |
| `RECOMMENDATIONS_LIMIT` | 10 | Tamaño de la sección |
| `CANDIDATE_WINDOW` | 200 | Cuántos artículos recientes se puntúan |
| `HISTORY_LIMIT` | 1000 | Cuántas lecturas se consideran |

**Detalles que importan:**

* El puntaje es la **cantidad de tags distintos en común**, no una suma ponderada: un tag leído en 50 artículos vale lo mismo que uno leído en uno.
* **Los intereses pesan igual que un tag leído**: se suman al conjunto del perfil, sin ponderar. Un usuario nuevo con intereses pero sin historial ya tiene un perfil no vacío. Si la lectura de `user_interests` falla, se registra con `console.error` y el ranking sigue solo con el historial (a diferencia de historial y candidatos, que si fallan hacen fallar el cálculo).
* **No hay una rama "fallback" explícita** (el diseño original la pedía). Si el usuario no tiene historial **ni intereses** (por ejemplo, los usuarios anteriores a la migración `0010`, que no eligieron), todos los candidatos puntúan 0 y el desempate por recencia deja **los artículos más recientes de otros autores**: el fallback ocurre de forma implícita.
* Un candidato con score 0 igual entra en la lista si hay lugar, así la sección no queda vacía innecesariamente.
* Cualquier excepción se captura en `getRecommendedPosts`, se registra con `console.error` y devuelve `[]`.

## Datos

No se crean tablas. Consume:

| Tabla | Uso |
| :--- | :--- |
| `reading_history` | Historial del usuario (solo artículos leídos con sesión, ver [PRD-3](PRD-3-feed-follows.md)) |
| `user_interests` | Temas que el usuario eligió en el onboarding (privados, RLS de fila propia; ver [PRD-1](PRD-1-auth.md) y [ADR 0025](../adr/0025-intereses-en-onboarding.md)) |
| `post_tags` / `tags` | Tags de cada post, para comparar contra el perfil |
| `posts` | Candidatos: `status = 'published'`, `type = 'article'`, autor distinto del usuario |

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Scoring determinista, sin IA generativa** ([ADR 0004](../adr/0004-recomendaciones-scoring-determinista.md)) | Un LLM que recomiende | Es un problema de ranking por atributos, no de generación de texto: una consulta en milisegundos, cero tokens por carga de feed y 100 % explicable, sin riesgo de que un modelo invente relaciones. La IA se reserva para donde sí agrega valor ([PRD-5](PRD-5-ai-author.md), [PRD-6](PRD-6-ai-reader.md)) |
| **Filtrado por contenido, no colaborativo** | "Usuarios similares también leyeron" | No requiere comparar usuarios entre sí ni volumen de datos que el proyecto no tiene † |
| **Calcular en TypeScript sobre una ventana acotada (200 candidatos / 1000 lecturas)** | Una consulta SQL con agregación; una vista materializada; un cache en base | Tres consultas simples y una función pura fácil de testear (consta en `queries.ts` y `scoreByTags.test.ts`); la razón de descartar SQL o una vista materializada es †. Costo: el ranking no ve artículos fuera de los 200 más recientes |
| **Recalcular en cada visita a `/`, sin caché** | Guardar el resultado por sesión | Refleja la lectura más reciente sin invalidar nada †. Costo: tres consultas por carga (mitigado con `Suspense`) |
| **Solo artículos** ([PRD-7](PRD-7-notes-likes.md)) | Incluir notas | Las notas no llevan tags (lo impide la base, ver [PRD-7](PRD-7-notes-likes.md)): no hay señal para puntuarlas |
| **Excluir lo leído y lo propio** | Mostrar todo | Recomendar lo que ya se leyó o se escribió no aporta † |
| **Puntaje = tags distintos en común** | Ponderar por frecuencia o recencia de lectura | Simple y explicable †; se puede refinar después si hace falta |

## Criterios de aceptación

- [x] Un usuario sin historial ni intereses ve artículos recientes de otros autores.
- [x] Un usuario sin historial pero con intereses ve priorizados los artículos que comparten tags con ellos.
- [x] Si falla la lectura de los intereses, la sección se calcula solo con el historial.
- [x] Un usuario que leyó varios artículos de un tag ve priorizados otros artículos con ese tag.
- [x] Un artículo ya leído no vuelve a aparecer.
- [x] Los artículos propios no aparecen.
- [x] Las notas nunca aparecen.
- [x] Si el cálculo falla, la portada se muestra igual, sin la sección.
- [x] Sin sesión, o con `?tag=` activo, no se muestra la sección.

## Limitaciones conocidas y deuda

| Tema | Detalle |
| :--- | :--- |
| **Los tags son invisibles para los lectores** | Se guardan y alimentan este ranking, pero las tarjetas y el post no los muestran; el usuario no puede saber por qué se recomienda algo |
| Ventana acotada | Un artículo antiguo relevante fuera de los 200 más recientes nunca se recomienda |
| Sin ponderación | Todos los tags pesan igual; no se distingue lo muy leído de lo leído una vez |
| Cálculo en cada carga | No hay caché; el costo crece con `HISTORY_LIMIT` y `CANDIDATE_WINDOW` |
| Nada de la afinidad social | Seguir a un autor no influye en el ranking |

## Pruebas

| Tipo | Archivo | Cubre |
| :--- | :--- | :--- |
| Unitarias | `src/features/recommendations/scoreByTags.test.ts` | Construcción del perfil de tags, unión con los intereses (`withInterestTags`), exclusión de leídos y propios, puntaje, desempate por recencia e id, límite |
| e2e | — | La sección de recomendaciones no tiene prueba e2e |
