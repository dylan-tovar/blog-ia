# 0024. El perfil se crea en `/onboarding`, no al registrarse

- **Estado:** Aceptada
- **Fecha:** 2026-09-21
- **Fuentes:** [PRD-1](../prds/PRD-1-auth.md), [PRD-1.2](../prds/PRD-1.2-auth-security.md); `src/features/profile/actions.ts` (`completeOnboarding`), `src/features/auth/onboarding-gate.ts`, `src/proxy.ts`

## Contexto

El registro pedía cuatro datos de una vez (email, contraseña, nombre, username). Se quiere que pida solo email y contraseña (con confirmación) y que el resto del perfil se complete después. Pero `posts`, `subscriptions`, `reading_history` y `likes` tienen FK a `profiles(id)` (ADR 0002 y migraciones `0002`, `0003`, `0005`): una cuenta sin fila en `profiles` no puede publicar, seguir ni dar like. Y no hay trigger que la cree ([PRD-1](../prds/PRD-1-auth.md)).

## Decisión

`signUp` solo crea la cuenta en Auth y redirige a `/onboarding`; la Server Action `completeOnboarding` inserta la fila de `profiles` (nombre y username). El proxy garantiza que nadie con sesión use la app sin perfil. No hay migración: la política RLS de `INSERT` existente (`auth.uid() = id`) alcanza.

- **Sin trigger.** La fila la sigue creando una Server Action con la sesión del usuario y bajo RLS.
- **`INSERT`, no `upsert`.** Si el perfil ya existe, `completeOnboarding` redirige a `/` sin tocarlo (editarlo es tarea de `/settings`). Ante un `23505` se vuelve a consultar el perfil: si existe (doble envío) redirige a `/`; si no, es un conflicto de username ("Ese nombre de usuario ya está en uso."). No se depende del nombre del índice. El índice único es la fuente de verdad: se eliminó el chequeo previo `isUsernameAvailable`.
- **Puerta en el proxy.** En cada `GET` de página de un usuario con sesión (no `POST`, no `/api`), `proxy.ts` consulta `profiles` por `id`: sin fila redirige a `/onboarding`; con fila, `/onboarding` redirige a `/`; sin sesión, `/onboarding` redirige a `/login`. La decisión es la función pura `getGateRedirect`, con tests. Las respuestas de redirección copian las cookies de sesión que `getUser()` pudo haber renovado. Las Server Actions (`POST`) no se filtran, así que `signOut` funciona sin perfil; `/onboarding` incluye un botón de cerrar sesión.
- **Falla abierta.** Si la consulta del proxy da error, no se redirige y se registra en el log: preferimos dejar pasar a alguien sin perfil (las escrituras fallarían por FK) que bloquear a todos ante una caída parcial de la base.
- **Redirección post-login.** `resolveAuthRedirect` rechaza también `/register`, `/onboarding` y cualquier valor con `\` (los navegadores lo leen como `/`).

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Trigger en `auth.users` que cree el perfil | No conoce nombre ni username del formulario que aún no se mostró; habría que crear un perfil vacío y completarlo igual. Además, el ADR 0007 lo marca como motivo para revisar el login por username |
| Insertar el perfil en `signUp` con todos los datos | Es el flujo anterior: contradice el objetivo de un registro de tres campos |
| Gate solo en las páginas (layouts o `getViewer`) en lugar del proxy | Habría que repetirlo en cada layout y ruta; `/` y `/explore` son públicas y no pasarían por un guard de rutas privadas †  |

## Consecuencias

- **A favor:** registro corto; el perfil se valida con el mismo esquema y errores que el resto; sin cuentas huérfanas por un username repetido; sin migración.
- **En contra:**
  - **Una consulta por navegación.** El proxy hace un `select id` a `profiles` en cada `GET` de un usuario con sesión, incluidos los prefetch (Next.js quita `next-router-prefetch` de los headers que ve el proxy, así que no se pueden distinguir). Es una lectura por clave primaria, pero suma latencia a cada página.
  - Una cuenta puede existir sin perfil (entre `signUp` y el envío de `/onboarding`); quien abandona el paso queda retenido en `/onboarding` (solo puede completar el perfil o cerrar sesión).
- **Confirmación de email.** Con "Confirm email" activado en Supabase, `signUp` no devuelve sesión y `/onboarding` (que exige sesión) redirigiría a `/login` sin explicación. Se comprobó en el proyecto real (`GET /auth/v1/settings` daba `mailer_autoconfirm: false`) y es lo que ocurrió al probar el registro. `signUp` ahora detecta que no hay sesión y muestra el aviso "Te enviamos un email para confirmar tu cuenta" en lugar de redirigir. Para llegar directo a `/onboarding` hay que desactivar "Confirm email" (Auth → Sign In / Providers → Email); mantenerlo exigiría además una ruta de callback que canjee el enlace del correo, que este cambio no incluye. El e2e `register` asume que no se exige ([testing](../guides/testing.md)).
- **Cuándo revisar:** si el costo de la consulta del proxy importa (por ejemplo, cachear el resultado en una cookie firmada o mover la comprobación a los layouts), o si se migra la creación del perfil a un trigger.

<!-- † Alternativa reconstruida al escribir el ADR; el motivo de descartarla no quedó registrado. -->
