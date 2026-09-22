# PRD 11.2 - Email de bienvenida

| Campo | Valor |
| :--- | :--- |
| Estado | **Por implementar** |
| Depende de | [PRD-11](PRD-11-emails-transaccionales.md) (setup compartido de `src/lib/email/`), [PRD-1](PRD-1-auth.md) (onboarding y `completeOnboarding`) |
| Migraciones | Ninguna |
| ADRs relacionados | [0028](../adr/0028-emails-transaccionales-resend.md) |
| Código (a crear) | `src/lib/email/templates/welcome.ts`, cambio en `src/features/profile/actions.ts` (`completeOnboarding`) |

## Problema y objetivo

**Problema.** Terminar el registro no tiene ningún cierre fuera de la app: el usuario nuevo no recibe nada que confirme que su cuenta quedó lista ni que le presente el producto.

**Objetivo.** Mandar un correo de bienvenida personalizado apenas el usuario termina `/onboarding` — ahí, y no antes, existe su `display_name`, así que el correo puede saludarlo por nombre en vez de ser un genérico "gracias por registrarte".

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Un correo, disparado una sola vez, al completar el onboarding | Secuencia de varios correos (drip) |
| Contenido estático personalizado con el nombre | Contenido dinámico (recomendaciones, tags de interés elegidos) |
| Best-effort: un fallo de envío no rompe el onboarding | Reintentos o cola si el envío falla |

## Cómo va a funcionar

- `src/lib/email/templates/welcome.ts`: `welcomeEmail({ displayName }) => { subject, html }`. HTML simple, sin necesidad de reusar `MarkdownContent.tsx` (no hay contenido dinámico en Markdown acá).
- `src/features/profile/actions.ts`, `completeOnboarding`: el disparo va **solo en el camino de INSERT exitoso**, no en el re-query por `23505` (doble submit de un profile ya creado) — evita mandar el correo dos veces si el usuario reenvía el formulario.
  ```ts
  void sendEmail({ to: user.email, ...welcomeEmail({ displayName: parsed.data.displayName }) })
    .catch((error) => console.error("[welcome-email] failed", error));
  ```
  `user.email` sale de `requireUser()` (la sesión actual vía `supabase.auth.getUser()`) — no hace falta admin client ni una función SQL acá, a diferencia de [PRD-11.3](PRD-11.3-nuevo-articulo-seguidos.md), que sí necesita leer el email de *otros* usuarios.
- El envío no debe bloquear ni poder romper el redirect de onboarding: `sendEmail` (definido en el setup compartido de [PRD-11](PRD-11-emails-transaccionales.md)) ya nunca lanza, así que alcanza con no esperarlo.

## Criterios de aceptación

- [ ] Completar `/onboarding` por primera vez dispara el correo de bienvenida con el nombre correcto.
- [ ] Un doble submit de `/onboarding` (profile ya existente, camino `23505`) **no** vuelve a mandar el correo.
- [ ] Si `sendEmail` falla (API caída, key inválida), el onboarding igual redirige con éxito y el error queda logueado.

## Pruebas

- Unitarias: `welcomeEmail` (snapshot del HTML con distintos nombres), `completeOnboarding` con mock de `sendEmail` verificando que se llama una sola vez en el camino de insert y ninguna en el de `23505`.
