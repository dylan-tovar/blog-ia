# 0025. El onboarding tiene un segundo paso obligatorio para elegir intereses

- **Estado:** Aceptada. Reemplaza parcialmente la regla de la puerta del [ADR 0024](0024-perfil-en-onboarding.md) (tener perfil ya no alcanza) y matiza el [ADR 0020](0020-tags-como-metadato-interno.md) (los tags ahora se muestran en el onboarding).
- **Fecha:** 2026-09-21
- **Fuentes:** [PRD-1](../prds/PRD-1-auth.md), [PRD-4](../prds/PRD-4-recommendations.md); `supabase/migrations/0010_onboarding_interests.sql`, `src/features/interests/` (`actions.ts`, `constants.ts`, `selection.ts`, `queries.ts`), `src/features/auth/onboarding-gate.ts`, `src/proxy.ts`, `src/features/recommendations/scoreByTags.ts` (`withInterestTags`), `src/app/(auth)/onboarding/page.tsx`

## Contexto

Con el ADR 0024 el onboarding pide nombre y username y termina. Un usuario nuevo llega al feed sin historial de lectura, así que "Recomendados para ti" no tiene señal ([ADR 0004](0004-recomendaciones-scoring-determinista.md): el perfil de tags sale del historial). Se quiere pedir temas de interés en el onboarding para tener una señal desde el primer día, sin abrir un flujo aparte ni dejar cuentas a medio configurar.

## Decisión

El onboarding pasa a dos pasos en `/onboarding`: el paso 1 (nombre y username, ya existente) y el paso 2, elegir temas. **El paso 2 es obligatorio: mínimo 3 temas, máximo 20.** Los temas elegidos alimentan las recomendaciones.

- **El estado del asistente se deriva de la base, no de la URL ni de una cookie.** `profiles.onboarded_at` (`timestamptz`, `null` = falta el paso 2) más la existencia de la fila de `profiles` dan tres estados: `none` (sin perfil, paso 1), `interests` (perfil sin `onboarded_at`, paso 2) y `done`. Lo calcula la función pura `getOnboardingState`. La migración `0010` hace **backfill**: todos los perfiles que ya existían quedan con `onboarded_at = created_at`, para no mandar a nadie ya activo a elegir intereses. El backfill corre solo la primera vez (cuando la columna todavía no existe), así que volver a correr el archivo no marca como terminado a quien esté a mitad del onboarding.
- **Tabla privada `user_interests`** `(user_id, tag_id)` con PK compuesta y RLS de fila propia: cada usuario solo lee, inserta y borra las suyas. No hay política de UPDATE: cambiar una elección es borrar e insertar. `saveInterests` reemplaza por diferencia (`planInterestChanges`), así los reintentos y los dobles envíos son seguros, y recién después marca `onboarded_at` con un `update ... where onboarded_at is null`.
- **Regla de relajación del mínimo.** El mínimo es `min(3, cantidad de tags elegibles)`: con menos de 3 tags disponibles se pide la cantidad que haya, y con ninguno el paso se puede completar sin elegir. Es para que nadie quede atrapado en un paso que no puede cumplir (proyecto nuevo, base casi vacía). Si la carga de los tags falla, no se trata como "no hay tags": se muestra un error con reintento, porque de lo contrario el fallo dejaría saltear un paso obligatorio.
- **`popular_tags(p_limit)` limita la oferta a artículos publicados.** La función SQL (`security invoker`, `stable`, `search_path` vacío) devuelve los tags de artículos `published`, ordenados por cantidad de usos y luego por nombre; el onboarding pide 30 (`INTEREST_TAGS_LIMIT`). Se ejecuta con los permisos de quien llama, así que las políticas de `posts` y `post_tags` siguen aplicando. `saveInterests` recalcula el conjunto elegible en el servidor y valida contra él: la lista del cliente no se toma como cierta.
- **La puerta cambia sin costo extra.** El proxy ya hacía un `select` a `profiles` por navegación ([ADR 0024](0024-perfil-en-onboarding.md)); ahora pide `id, onboarded_at` en la misma consulta. `getGateRedirect` recibe el estado (`none | interests | done | null`): todo estado distinto de `done` se redirige a `/onboarding`, y `done` sale de `/onboarding` hacia `/`. Sigue fallando abierto (`null` no redirige). `completeOnboarding` ahora redirige a `/onboarding` en lugar de `/`, y la página decide el paso que sigue.
- **Los intereses alimentan las recomendaciones.** `loadRecommendations` lee `user_interests` en paralelo con el historial y `withInterestTags` los une al perfil de tags leído. Si esa lectura falla, se registra y el ranking sigue solo con el historial. Los tags de interés no cambian el resto del scoring ([ADR 0004](0004-recomendaciones-scoring-determinista.md)); un usuario en frío ahora tiene ranking personalizado.
- **Los tags no dejan de ser metadato para los lectores, pero el onboarding los muestra.** Esto reemplaza parcialmente el [ADR 0020](0020-tags-como-metadato-interno.md), que los mantenía fuera de la UI salvo `/explore` y el diálogo de publicar.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Paso 2 opcional (con "Omitir") | Se quiere señal para todos los usuarios nuevos; un paso salteable termina con la mayoría en frío. El costo (un paso más) se aceptó † |
| Estado del paso en la URL (`/onboarding/intereses`) o en una cookie | Se puede falsear o perder, y la puerta del proxy no lo sabría. Con `onboarded_at` la base es la fuente de verdad y el estado sobrevive a cambiar de navegador o dispositivo † |
| Columna `interests uuid[]` (o `text[]`) en `profiles` | Sin FK a `tags` ni cascada al borrar un tag, y más difícil de consultar y de indexar por tag. Una tabla de unión encaja con `post_tags` y `reading_history` † |
| Ofrecer todos los tags | Los tags los crea cualquier usuario autenticado y no hay moderación (ver Consecuencias): incluiría tags huérfanos o sin artículos publicados, que no aportan a las recomendaciones † |

## Consecuencias

- **A favor:** señal de recomendación desde el primer día; el estado del onboarding es un dato de la base, sin consulta extra en el proxy; los intereses son privados por RLS.
- **En contra:**
  - **Los tags son texto libre y sin moderación.** Los crea cualquier usuario al publicar, así que el paso 2 puede mostrar errores de tipeo o duplicados (`arquitectura` y `arqitectura`, `ts` y `typescript`). Como los ordena por usos, los más comunes suben, pero no se normaliza ni se fusiona nada. Por eso el ADR 0020 queda superado en parte: los tags ya no son solo metadato interno.
  - Un paso más antes de llegar al feed, y obligatorio: quien abandona queda retenido en `/onboarding` (solo puede completar el paso o cerrar sesión).
  - Los usuarios existentes no eligen intereses (el backfill los marca como terminados); su perfil de recomendaciones sigue dependiendo del historial.
- **La migración `0010` se aplica a mano ANTES de desplegar este código** ([ADR 0016](0016-migraciones-sql-manuales.md)). Si no se aplicó, el `select` de `onboarded_at` da error en dos lugares (leído del código; no se probó contra una base sin la migración):
  - **Proxy:** registra el error y falla abierto, así que no bloquea a nadie, pero tampoco retiene a quien no terminó el onboarding.
  - **`getCurrentProfile`** (que también pide `onboarded_at`) devuelve `profile = null` para todos: `/onboarding` muestra siempre el paso 1 (quien lo envía crea el perfil y vuelve al mismo paso), el paso 2 es inalcanzable (tampoco existen `user_interests` ni `popular_tags`) y `/settings` pierde los datos del perfil.
  - Las recomendaciones siguen funcionando: la lectura de `user_interests` es tolerante a fallos.
- **Cuándo revisar:** si los tags duplicados o mal escritos ensucian la oferta (normalizar, fusionar o curar una lista), si el mínimo obligatorio aumenta el abandono del registro, o si se quiere permitir editar los intereses después del onboarding (hoy no hay pantalla para hacerlo).

<!-- † Motivo reconstruido al escribir el ADR; el motivo de descartarla no quedó registrado. -->
