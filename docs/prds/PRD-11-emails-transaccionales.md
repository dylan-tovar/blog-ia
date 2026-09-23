# PRD 11 - Emails transaccionales con Resend

| Campo | Valor |
| :--- | :--- |
| Estado | **Implementado.** Auditoría 2026-09-23: `src/lib/email/` (cliente, envío, markdown-a-HTML, plantillas de bienvenida y nuevo artículo), `0012_email_preferences.sql` y las tres rutas de correo (confirmación/recuperación, bienvenida, nuevo artículo) están en el código; ver el estado de cada paquete |
| Depende de | [PRD-1](PRD-1-auth.md) (auth y signup), [PRD-2.4](PRD-2.4-publish-dialog-tags.md) / [PRD-5.3](PRD-5.3-publish-moderation.md) (publicar y moderación), [PRD-3.1](PRD-3.1-follow-system.md) (seguir) |
| Migraciones | `0012_email_preferences.sql` (nueva: columnas de `profiles` y función `follower_emails_for_author`) |
| ADRs relacionados | [0028](../adr/0028-emails-transaccionales-resend.md), [0027](../adr/0027-notificaciones-por-triggers-sql.md) (precedente de "sin infra nueva"), [0007](../adr/0007-login-por-username-con-secret-key.md) (precedente de leer `auth.users` con `SECURITY DEFINER`) |
| Código (a crear) | `src/lib/email/` (cliente, envío, markdown-a-HTML, plantillas), `src/lib/env.server.ts` (`getEmailEnv`), `src/lib/env.ts` (`NEXT_PUBLIC_SITE_URL`) |

## Paquetes de trabajo

| Paquete | Qué cubre | Dificultad | Esfuerzo |
| :--- | :--- | :--- | :--- |
| [PRD-11.1 — Confirmación y recuperación de contraseña](PRD-11.1-confirmacion-y-recuperacion.md) | Reactivar confirmación, SMTP custom, `/auth/confirm`, forgot/reset password | M | M |
| [PRD-11.2 — Email de bienvenida](PRD-11.2-bienvenida.md) | Correo al terminar `/onboarding`, vía API de Resend | B | S |
| [PRD-11.3 — Nuevo artículo de autor seguido](PRD-11.3-nuevo-articulo-seguidos.md) | Fan-out a seguidores al publicar, Markdown→HTML, opt-out y baja | A | M |

## Resumen

El usuario ya compró un dominio y configuró su DNS para mandar correo con [Resend](https://resend.com). Este PRD agrega el primer envío de email propio del proyecto: confirmación de cuenta (reactivada) y recuperación de contraseña por el canal nativo de Supabase Auth (SMTP custom apuntando a Resend), y dos correos nuevos disparados por código propio con la API de Resend — bienvenida al terminar el registro, y aviso a los seguidores de un autor cuando publica un artículo, con el contenido completo en Markdown renderizado a HTML.

## Problema y objetivo

**Problema.** Hoy no hay ninguna forma de recuperar una contraseña olvidada, la confirmación de cuenta está desactivada (cualquiera puede registrarse con un email ajeno), y no hay ningún aviso fuera de la app cuando pasa algo relevante (alguien se registró, un autor que seguís publicó). Todo el proyecto vive dentro de la sesión web; no hay ningún punto de contacto por correo.

**Objetivo.**

- Dar un camino real para recuperar el acceso a una cuenta sin depender de soporte manual.
- Verificar que el email de cada cuenta le pertenece a quien se registra, protegiendo la recuperación de contraseña y la calidad de la lista de destinatarios de futuros correos.
- Dar la bienvenida a cada usuario nuevo con un correo personalizado.
- Traer de vuelta a los lectores avisándoles cuando un autor que siguen publica, con el artículo completo para leer directo desde el correo.

## Alcance / fuera de alcance

| Dentro | Fuera (de este PRD) |
| :--- | :--- |
| Confirmación de cuenta y recuperación de contraseña vía Supabase Auth + SMTP custom | Login social, 2FA, cambio de email (fuera de alcance también de [PRD-1](PRD-1-auth.md)) |
| Correo de bienvenida al completar `/onboarding` | Onboarding por email (drip campaign, secuencia de varios correos) |
| Aviso de nuevo artículo a seguidores, con opt-out propio | Notificar likes/notas por correo (solo queda el in-app de [ADR 0027](../adr/0027-notificaciones-por-triggers-sql.md)); digest/resumen semanal |
| Cola/reintentos | Ninguno — envío síncrono best-effort, sin cola ni cron nuevos ([ADR 0028](../adr/0028-emails-transaccionales-resend.md)) |
| Deliverability (SPF/DKIM/DNS) | Ya resuelto por el usuario en su proveedor de dominio, no es parte del código |

## Setup compartido (antes de los tres paquetes)

- Dependencias nuevas: `resend`, `remark-html`.
- `src/lib/env.server.ts`: `getEmailEnv()` con el mismo patrón lazy que `getAiEnv()` — `RESEND_API_KEY`, `RESEND_FROM_EMAIL`.
- `src/lib/env.ts`: `NEXT_PUBLIC_SITE_URL` (no existe hoy; la necesitan el link de reset, el de bienvenida y el de baja).
- `.env.example`: documentar las tres variables nuevas.
- `src/lib/email/`:
  - `client.ts` — cliente Resend cacheado (mismo patrón que el cliente de `gemini.ts`).
  - `send.ts` — `sendEmail({ to, subject, html })`, nunca lanza, siempre `{ ok }`.
  - `markdown.ts` — `markdownToEmailHtml(markdown)` con `remark` + `remark-gfm` + `remark-html` (sanitizado), ya que `MarkdownContent.tsx` es un componente React y no sirve para producir un string de HTML de email.
  - `templates/welcome.ts`, `templates/new-article.ts` — funciones puras `(props) => { subject, html }`.

## Riesgos conocidos

| Riesgo | Detalle | Mitigación en este PRD |
| :--- | :--- | :--- |
| Rate limit de Resend | Un autor con muchos seguidores dispara igual cantidad de llamadas en un solo `after()`; el free tier limita req/s | Ninguna en esta iteración (cola descartada por [ADR 0028](../adr/0028-emails-transaccionales-resend.md)); queda como mejora futura si el volumen crece |
| SMTP custom es config de dashboard | No vive en `supabase/migrations/`; un entorno nuevo no lo tiene por default | Documentar el paso manual en `docs/guides/getting-started.md` y en [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md) |
| Sanitizado de `remark-html` | Puede no bastar contra Markdown adversarial (links `javascript:`, atributos de evento) | Verificar con casos de prueba antes de dar por cerrado [PRD-11.3](PRD-11.3-nuevo-articulo-seguidos.md); sumar `sanitize-html` si hace falta |
| Token de unsubscribe sin firmar | Un `uuid` filtrado puede apagar la preferencia de otro usuario | Aceptado: el radio de impacto es solo ese boolean, nunca la cuenta ([ADR 0028](../adr/0028-emails-transaccionales-resend.md)) |

## Pendiente fuera de este PRD

- Reparto de los tres paquetes en `docs/team/reparto-de-tareas.md`.
- Verificar en el dashboard de Supabase que el SMTP custom y el toggle de confirmación queden aplicados en todos los entornos (local/staging/prod comparten el mismo proyecto hospedado, según lo verificado en la exploración previa).
