# PRD-5.2 — Límite de peticiones a la IA por minuto (dos carriles)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-5 — IA para el autor](PRD-5-ai-author.md) |
| Dificultad / Esfuerzo | A (avanzada) / M (2 a 3 días) |
| Dueño sugerido / Mentor | D1 / — |
| Depende de | [PRD-5.1](PRD-5.1-ai-foundation.md) (`AiError`, variables de entorno), cliente admin de [PRD-1.2](PRD-1.2-auth-security.md) |
| Alimenta a | [PRD-5.3](PRD-5.3-publish-moderation.md) (carril de moderación), [PRD-6.1](PRD-6.1-summary-backend.md) y [PRD-8.1](PRD-8.1-chat-server.md) (carril de asistencia) |
| Código | `src/features/ai/rate-limit.ts`, `rate-limit.server.ts`, `src/features/ai/cached-feature.ts` (uso), `supabase/migrations/0007_ai_features.sql` (partes 5 y 6) |
| ADRs | [0011](../adr/0011-ia-con-gemini.md) |

## Resumen

Cuenta cuántas peticiones a Gemini hace cada usuario y todo el proyecto **por minuto**, y rechaza las que se pasan. Existe porque la cuota gratuita de Gemini es limitada y compartida: un usuario (o un atacante) podría agotarla para todos. Hay **dos carriles** de contadores separados: uno para las funciones de asistencia (chat y resumen) y otro para la moderación al publicar, para que agotar el primero nunca impida publicar.

## Qué necesitás entender antes

- [ ] Qué es un **límite de peticiones** (*rate limit*) y por qué se mide por ventanas de tiempo.
- [ ] Qué es una **función de base de datos** (RPC) y por qué una sola llamada `INSERT ... ON CONFLICT DO UPDATE` es atómica (dos usuarios simultáneos no se pisan).
- [ ] Qué significa **fallar cerrado**: ante la duda, se rechaza. Y **fallar abierto**: ante la duda, se permite.
- [ ] Qué es `service_role` y por qué solo el servidor puede llamar a esta función.
- [ ] Glosario: [docs/README.md](../README.md#glosario) (carril, compare-and-set).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| La tabla `ai_rate_limits` y la función `ai_rate_limit_hit` | Cómo decide la moderación qué hacer si el límite se alcanza: [PRD-5.3](PRD-5.3-publish-moderation.md) |
| Las claves de cada carril y sus valores por defecto | Mostrar la cuenta regresiva al usuario: [PRD-8.2](PRD-8.2-chat-drawer-ui.md) y `AiErrorMessage` |
| Traducir la respuesta de la base a `RateLimitResult` y a `AiError` | Los errores del proveedor (`quota`): [PRD-5.1](PRD-5.1-ai-foundation.md) |

## Cómo funciona

Orden de lectura sugerido: `0007_ai_features.sql` (partes 5 y 6) → `rate-limit.ts` → `rate-limit.server.ts` → `cached-feature.ts`.

### 1. Los contadores (base de datos)

`public.ai_rate_limits (key, window_start, count)` con clave primaria `(key, window_start)`. Tiene **RLS activada y ninguna política**, y se revocaron todos los permisos a `anon` y `authenticated`: nadie la lee ni la escribe desde el navegador. Solo se accede desde la función.

### 2. La función `ai_rate_limit_hit`

```text
ai_rate_limit_hit(p_user_key, p_user_limit, p_global_limit, p_global_key = 'global'):
  ventana = minuto actual (date_trunc('minute', now()))
  retry   = segundos hasta el próximo minuto (mínimo 1)
  2 % de las veces: borrar ventanas de más de 1 hora

  sumar 1 al contador de (p_user_key, ventana)         <- INSERT ... ON CONFLICT DO UPDATE
  si el contador > p_user_limit  -> devolver (false, 'user', retry)   [y NO toca el global]

  sumar 1 al contador de (p_global_key, ventana)
  si el contador > p_global_limit -> devolver (false, 'global', retry)

  devolver (true, null, 0)
```

Detalles que conviene entender:

- **Primero el usuario, luego el global.** Un usuario que ya se pasó no consume cupo global: no puede agotar la cuota de todos.
- **Un intento rechazado igual suma.** El contador se incrementa antes de comparar, así que insistir durante el mismo minuto no abre la puerta antes; solo la abre el minuto siguiente.
- **Ventana fija de un minuto.** Al cambiar de minuto los contadores empiezan de cero. Consecuencia lógica de la técnica: en la frontera entre dos minutos puede pasar hasta el doble del límite. Es una inferencia, no consta como decisión †.
- **Solo la ejecuta `service_role`** (`revoke ... from public, anon, authenticated; grant execute ... to service_role`). El servidor arma las claves, así que el cliente no puede suplantar a otro usuario.

### 3. Los carriles (`rate-limit.ts`)

| Carril | Clave por usuario | Clave global | Límite global (por defecto) |
| :--- | :--- | :--- | :--- |
| `assist` (chat, resumen) | `user:<id>` | `global` | 6 (`AI_RATE_LIMIT_GLOBAL_PER_MIN`) |
| `moderation` (publicar) | `moderation:user:<id>` | `moderation:global` | 4 (`AI_RATE_LIMIT_MODERATION_GLOBAL_PER_MIN`) |

El límite **por usuario** es el mismo valor para los dos carriles: `AI_RATE_LIMIT_USER_PER_MIN` (5 por defecto), aunque con contadores distintos. `laneKeys(userId, lane)` devuelve las dos claves de cada carril.

### 4. Del lado del servidor (`rate-limit.server.ts`)

```text
checkAiRateLimit(userId, lane = "assist"):
  llamar al RPC con el cliente admin y los valores del entorno
  si el RPC falla o la respuesta no tiene la forma esperada -> { ok:false, kind:"unavailable" }   <- falla CERRADO
  si allowed = true  -> { ok: true }
  si no              -> { ok:false, kind:"rate_limited", scope, retryAfter }
```

`interpretRateLimitRows` (en `rate-limit.ts`) valida la respuesta: **una respuesta faltante o mal formada nunca cuenta como permitida**. `rateLimitToAiError` la convierte en `AiError` (`rate_limited` con `retryAfter` y `scope`, o `unavailable`). `enforceAiRateLimit(userId)` es la versión que lanza el error, para funciones sin caché.

### 5. Dónde se usa

| Uso | Carril | Qué hace si se rechaza |
| :--- | :--- | :--- |
| Chat ([PRD-8.1](PRD-8.1-chat-server.md)) | `assist` | Responde JSON con cuenta regresiva **antes** de abrir el stream |
| Resumen ([PRD-6.1](PRD-6.1-summary-backend.md)) | `assist`, vía `runCachedFeature` | Error `rate_limited`; un acierto de caché **no** consume cupo |
| Moderación ([PRD-5.3](PRD-5.3-publish-moderation.md)) | `moderation` | El artículo **no se publica** y el reclamo se libera |

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Límite en Postgres** ([ADR 0011](../adr/0011-ia-con-gemini.md)) | Contador en memoria (no se comparte entre instancias del servidor); Redis/Upstash (infraestructura nueva para un problema que Postgres ya resuelve) | Cada petición de IA cuesta una llamada extra a la base |
| **Dos carriles** (registrado: una revisión encontró que las funciones de asistencia podían agotar el cupo global del que depende publicar) | Un solo contador global | La moderación siempre tiene su propio cupo. La suma de los dos globales debería quedar por debajo del RPM que muestre Google AI Studio para el proyecto (consta en el [PRD-5](PRD-5-ai-author.md)) |
| **Falla cerrado** (comentario en `rate-limit.ts`) | Permitir si el limitador cae | Si la base falla, la IA de asistencia no responde. La moderación lo trata como caída del proveedor y publica sin tags ([PRD-5.3](PRD-5.3-publish-moderation.md)) |
| **Primero el usuario, luego el global** (comentario en la migración) | Solo global | Un usuario abusivo no agota el cupo de los demás |
| **Solo `service_role` puede ejecutarla** | Dejarla llamable por `authenticated` | El cliente no puede falsear claves ni consultarse el contador |
| **Valores por defecto 5 / 6 / 4** | — | La razón numérica de cada valor **no quedó registrada** †; los límites de la capa gratuita de Gemini no son públicos ([ADR 0011](../adr/0011-ia-con-gemini.md)) |

## Criterios de aceptación

- [ ] El sexto mensaje de un usuario en el mismo minuto es rechazado con `rate_limited` y `scope: "user"` (con los valores por defecto).
- [ ] Un usuario que ya superó su límite **no** aumenta el contador global.
- [ ] Cuando el global se pasa, el error lleva `scope: "global"` y un mensaje distinto ("La IA está saturada…").
- [ ] `retryAfter` es un entero de al menos 1 segundo.
- [ ] Si la base no responde o responde algo inesperado, la petición se rechaza (`unavailable`) y no se llama a Gemini.
- [ ] Agotar el carril de asistencia no impide llamar al carril de moderación.
- [ ] Un navegador con la clave pública no puede leer ni escribir `ai_rate_limits` ni ejecutar la función.

## Cómo verificarla a mano

1. `pnpm test`: mirá `rate-limit.test.ts` y `cached-feature.test.ts`.
2. En `.env.local` poné `AI_RATE_LIMIT_USER_PER_MIN=2`, reiniciá `pnpm dev`, abrí el chat del editor y enviá tres mensajes seguidos: el tercero debe mostrar la cuenta regresiva y el botón "Reintentar" deshabilitado hasta que llegue a cero.
3. En el SQL Editor de Supabase: `select * from public.ai_rate_limits order by window_start desc limit 10;` (con el rol del proyecto): verás las claves `user:<id>` y `global` con su `count`.
4. Con la clave pública (`anon`) intentá `select` sobre esa tabla: debe fallar por permisos.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Agregar una variable propia para el límite **por usuario** de moderación (hoy ambos carriles comparten `AI_RATE_LIMIT_USER_PER_MIN`; solo el global de moderación tiene variable) | M |
| `src/lib/supabase/database.types.ts` (se mantiene a mano, [ADR 0016](../adr/0016-migraciones-sql-manuales.md)) declara `ai_rate_limit_hit` pero no la tabla `ai_rate_limits` ni `can_attach_note`: completarlo | B |
| Documentar en `docs/db/schema.md` una consulta para ver el consumo por carril (la del punto 3 de arriba) | B |
| Evaluar una ventana deslizante para evitar el doble de peticiones en la frontera de dos minutos (decisión de diseño; nueva migración) | A |
| Un chat y sus atajos comparten 5 mensajes por minuto por usuario: valorar subirlo o separar carril para atajos (riesgo ya identificado en [PRD-8](PRD-8-ai-chat.md)) | M |

## Preguntas de autoevaluación

1. ¿Por qué el contador de usuario se comprueba **antes** que el global y qué protege eso?
2. ¿Por qué `ai_rate_limits` tiene RLS activada pero ninguna política?
3. ¿Qué significa fallar cerrado y en qué caso concreto de este proyecto se elige lo contrario (falla abierto)? ¿Quién lo decide?
4. ¿Qué problema resuelve tener un carril de moderación separado?
5. Si dos peticiones del mismo usuario llegan a la vez, ¿por qué no se pisan los contadores?
6. ¿Qué pasa en la frontera entre dos minutos y qué solución propondrías?
