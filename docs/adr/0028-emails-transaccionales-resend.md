# 0028. Emails transaccionales con Resend, sin cola nueva

- **Estado:** Aceptada.
- **Fecha:** 2026-09-22
- **Fuentes:** `docs/prds/PRD-11-emails-transaccionales.md` y sub-PRDs 11.1/11.2/11.3; [ADR 0027](0027-notificaciones-por-triggers-sql.md) (notificaciones in-app, precedente de "sin infra nueva"); `supabase/migrations/0004_username.sql` (`login_email_for_username`, precedente de `SECURITY DEFINER` sobre `auth.users`); `src/features/posts/actions.ts` (`publishPost`); `src/lib/env.server.ts` (`getAiEnv`, precedente de env lazy).

## Contexto

El proyecto no manda ningún correo propio. Supabase Auth manda su propia confirmación de cuenta (hoy desactivada) y no hay recuperación de contraseña. El usuario compró un dominio y configuró el DNS para usar Resend, y pidió cuatro correos: confirmación de cuenta, recuperación de contraseña, bienvenida al terminar el registro, y aviso a los seguidores de un autor cuando publica un artículo (con el artículo completo en Markdown).

El proyecto no tiene cola ni cron (todo corre síncrono dentro de las Server Actions, incluida la llamada a Gemini para moderación en `publishPost`), y el sistema de notificaciones in-app es enteramente trigger-based en SQL ([ADR 0027](0027-notificaciones-por-triggers-sql.md)) — un trigger no puede llamar a una API externa como Resend, así que los envíos de email son necesariamente un mecanismo nuevo en TypeScript, no una extensión de los triggers existentes.

## Decisión

- **Dos mecanismos de entrega distintos, según el tipo de correo:**
  - **Confirmación y recuperación de contraseña**: se reactiva "Confirm email" en Supabase Auth (estaba desactivada) y se configura **SMTP custom de Supabase apuntando a Resend**. Supabase sigue generando y validando los tokens (expiración, un solo uso, rate limiting) — Resend actúa solo de transporte SMTP. Se agrega una única ruta nueva, `src/app/auth/confirm/route.ts`, que reemplaza el link default de Supabase (`/auth/v1/verify`) por uno propio para poder decidir a dónde redirigir después (`/onboarding` en signup, `/reset-password` en recovery).
  - **Bienvenida y nuevo artículo**: correos que Supabase no dispara (no son eventos de Auth), enviados directo con la API de Resend desde código propio (`src/lib/email/`).
- **La confirmación se reactiva** porque sin ella cualquiera puede registrarse con un email ajeno: eso rompe la recuperación de contraseña (le llegaría a otra persona) y ensucia la tabla de destinatarios de "nuevo artículo" con direcciones que van a rebotar en cada envío.
- **El aviso de nuevo artículo se manda síncrono y best-effort, sin cola ni cron nuevos** — misma filosofía que ADR 0027 ("sin dependencia nueva de infraestructura"). Se dispara desde `publishPost` con `after()` de `next/server` (disponible en Next 16, ya en uso en el proyecto) en vez de un `void` suelto: en un entorno serverless una promesa no esperada puede cortarse apenas se manda la respuesta, mientras que `after()` la deja correr hasta terminar sin bloquear al usuario que publica. Los envíos van con `Promise.allSettled` (no un loop con `await` que corte en el primer error): un email que rebota no debe frenar el resto, y un fallo no reintenta — se loguea y se pierde, mismo trade-off aceptado que otros paths best-effort del proyecto (`recordRead`).
- **Los emails se leen de `auth.users`, no de `profiles`** (confirmado en `docs/db/schema.md`: el email no está en `profiles`). Para leer el email de *otros* usuarios (los seguidores, en el fan-out) se usa el mismo patrón que `login_email_for_username`: una función SQL `SECURITY DEFINER`, `search_path` vacío, revocada de `public`/`anon`/`authenticated` y otorgada solo a `service_role`, llamada con el admin client. Para el correo de bienvenida no hace falta: `completeOnboarding` ya tiene el email del propio usuario vía `requireUser()`.
- **Opt-out del correo de "nuevo artículo" independiente de dejar de seguir**: columna `notify_new_article_email boolean default true` en `profiles`, y un link de baja sin login en cada correo, identificado por un **`uuid` sin firmar** (`unsubscribe_token`) generado por fila. No lleva firma ni expiración a propósito: el token solo puede apagar ese boolean de esa fila — no lee ni cambia nada de la cuenta — así que un token filtrado no vale como vector de ataque real, y armar un esquema firmado sería complejidad sin beneficio de seguridad correspondiente. La ruta de baja es un `GET` que muta (clic directo desde el cliente de correo, sin login): mismo trade-off que cualquier unsubscribe de la industria, con impacto acotado a esa única preferencia.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Confirmación y recuperación 100% custom (tokens propios + API de Resend) | Reimplementa generación/expiración/rate-limit de tokens que Supabase Auth ya resuelve de forma probada; mucha más superficie de seguridad para mantener sin beneficio real |
| Cola nueva (tabla `email_jobs` + cron/Edge Function) para el fan-out de "nuevo artículo" | Infraestructura nueva que hoy no existe en el proyecto, en contra del criterio ya usado en ADR 0027; el volumen esperado de seguidores por autor no la justifica todavía |
| `void` suelto para el fan-out en vez de `after()` | En Vercel (serverless) el proceso puede terminar apenas se envía la respuesta, cortando una promesa no esperada a mitad de camino; `after()` está disponible en Next 16 y resuelve esto sin agregar infraestructura |
| Token de unsubscribe firmado (JWT/HMAC con expiración) | El radio de impacto de un token filtrado es apagar un boolean, no acceder a la cuenta; la complejidad extra no compra seguridad real |
| Guardar el email en `profiles` para simplificar las consultas | Duplicaría una fuente de verdad que ya vive en `auth.users`, con riesgo de desincronización si el usuario cambia su email en Supabase Auth |

## Consecuencias

- **A favor:** cero infraestructura nueva más allá de una migración y un módulo `src/lib/email/`; Supabase sigue siendo dueño de la seguridad de tokens de Auth; el patrón de `SECURITY DEFINER` para `auth.users` ya está probado en el repo (`login_email_for_username`); el opt-out es simple y no requiere login.
- **En contra:** un autor con muchos seguidores dispara igual número de llamadas a la API de Resend en un solo `after()`, sin control de rate limit propio — en el free tier de Resend esto puede generar envíos fallidos sin reintento; la config de SMTP custom vive solo en el dashboard de Supabase, fuera de `supabase/migrations/`, así que un entorno nuevo no la tiene por default y hay que documentarla como paso manual.
- **Cuándo revisar:** si el volumen de seguidores por autor crece lo suficiente como para pegarle al rate limit de Resend, evaluar una cola real (tabla + cron) en vez de `after()` síncrono; si el sanitizado de `remark-html` resulta insuficiente contra Markdown adversarial, sumar un sanitizador dedicado (`sanitize-html`) al render de email.
