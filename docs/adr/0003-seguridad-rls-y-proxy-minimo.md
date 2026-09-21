# 0003. Seguridad solo con RLS y `proxy.ts` mínimo

- **Estado:** Aceptada
- **Fuentes:** [PRD-global](../PRD-global-vision.md) secciones 9 y 15; [PRD-1](../prds/PRD-1-auth.md) (sección «Protección de rutas»); `src/proxy.ts`, `supabase/migrations/`

## Contexto

Hace falta una defensa de acceso a datos confiable sin duplicar verificaciones en la aplicación.

## Decisión

- La autorización real vive en las políticas RLS de Supabase: rechazan el acceso incluso si alguien llama directo a la API.
- `src/proxy.ts` (reemplaza a `middleware` desde Next.js 16) solo redirige a `/login` cuando no hay sesión en rutas privadas. Es UX, no seguridad.
- No hay verificación de rol adicional en cada acción sensible.

En el código: `proxy.ts` define `PROTECTED_PATHS = ["/settings", "/editor", "/posts"]` y refresca la sesión con `supabase.auth.getUser()`. Las actions de `posts` además llaman a `getUser()` y filtran por `author_id`; es una consulta de conveniencia, RLS sigue siendo el límite.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Middleware que verifique rol en cada acción sensible | RLS ya es la defensa real; la verificación duplicada agrega código, no seguridad |
| Autorización solo en la aplicación, sin RLS | Un acceso directo a la API de Supabase la evitaría |

## Consecuencias

- **A favor:** un único punto de verdad para permisos (SQL versionado en `supabase/migrations/`).
- **En contra:** `PROTECTED_PATHS` es una lista manual; una ruta privada nueva debe agregarse ahí o quedará sin redirección (RLS seguiría protegiendo los datos).
- **Cuándo revisar:** si se agregan roles o rutas privadas que dependan de algo más que la sesión.

## Actualización (2026-09-20)

- **`PROTECTED_PATHS` sigue siendo `/settings`, `/editor`, `/posts`.** Las páginas `/profile` y `/activity` no están en la lista: cada una redirige a `/login` por sí misma (`getViewer()`), y `/api/ai/*` responde 401 JSON desde su propio código. Es coherente con la decisión (el proxy es UX), pero significa que "ruta privada" no se lee en un solo lugar.
- **La defensa de datos se reforzó por columna:** además de RLS, el cliente perdió los privilegios de escritura sobre `status`, `published_at`, `rejection_reason` y `ai_*` ([ADR 0012](0012-integridad-de-escritura-de-posts.md)). El cliente admin (secret key) ya no se usa solo para el login por username: ver [ADR 0007](0007-login-por-username-con-secret-key.md) y [arquitectura](../architecture/overview.md).

## Actualización (2026-09-21)

- **El proxy ya no es solo un redirector a `/login`.** Además consulta `profiles` (una vez por navegación `GET` de un usuario con sesión) y lleva a `/onboarding` a quien aún no tiene perfil ([ADR 0024](0024-perfil-en-onboarding.md)). Sigue siendo UX y no seguridad: si la consulta falla, deja pasar, y RLS sigue siendo el límite. La lista de rutas privadas (ahora con `/onboarding`) vive en `src/features/auth/onboarding-gate.ts`.
