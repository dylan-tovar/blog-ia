# PRD 11.1 - Confirmación de email y recuperación de contraseña

| Campo | Valor |
| :--- | :--- |
| Estado | **Por implementar** |
| Depende de | [PRD-11](PRD-11-emails-transaccionales.md) (setup compartido de `src/lib/email/` y env), [PRD-1](PRD-1-auth.md) (`signUp`/`signIn`) |
| Migraciones | Ninguna propia (usa los flujos nativos de Supabase Auth) |
| ADRs relacionados | [0028](../adr/0028-emails-transaccionales-resend.md) |
| Código (a crear) | `src/app/auth/confirm/route.ts`, `src/app/(auth)/forgot-password/`, `src/app/(auth)/reset-password/`, cambios en `src/features/auth/actions.ts`, `src/features/auth/schemas.ts`, `src/features/auth/components/LoginForm.tsx` |

## Por qué se agrupan confirmación y recuperación

Comparten todo el mecanismo de entrega: mismo SMTP custom de Supabase apuntando a Resend, mismas plantillas de dashboard, y la misma ruta de verificación (`/auth/confirm`) para ambos flujos. Separarlas en dos PRDs duplicaría esa parte sin ganar nada en revisión.

## Problema y objetivo

**Problema.** La confirmación de cuenta está desactivada, así que cualquiera puede registrarse con un email que no le pertenece. No existe ninguna forma de recuperar el acceso a una cuenta con la contraseña olvidada; hoy la única salida sería una intervención manual en la base.

**Objetivo.** Reactivar la verificación de email en el registro, y dar un flujo self-service de "olvidé mi contraseña" que no dependa de nadie del equipo.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Reactivar "Confirm email" en Supabase Auth | Cambio de email de una cuenta existente |
| SMTP custom de Supabase apuntando a Resend | Login social / 2FA |
| `/auth/confirm`: ruta única de verificación para signup y recovery | Rate-limit propio sobre `resetPasswordForEmail` (Supabase ya limita) |
| `/forgot-password` y `/reset-password` | Notificar al dueño de la cuenta si alguien pidió un reset (fuera de alcance del MVP) |

## Cómo va a funcionar

### Pasos manuales de dashboard (fuera de control de versiones)

1. **Auth → SMTP Settings**: activar SMTP custom, apuntando al relay de Resend con el dominio ya configurado por DNS.
2. **Auth → Providers → Email**: reactivar "Confirm email".
3. **Auth → Email Templates**: acortar "Confirm signup" y "Reset password" a algo funcional (no necesitan ser el correo de bienvenida — ese es aparte, [PRD-11.2](PRD-11.2-bienvenida.md)), y apuntar ambas al link propio:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=<path>`
   en vez del endpoint default de GoTrue (`/auth/v1/verify`), para poder decidir a dónde redirigir después de validar el token.

Documentar estos tres pasos en `docs/guides/getting-started.md` como setup manual requerido — no viven en `supabase/migrations/`.

### Código

```text
GET /auth/confirm?token_hash=...&type=signup|recovery&next=...
  supabase = createClient()               // server, para que setee cookies de sesión
  { error } = supabase.auth.verifyOtp({ type, token_hash })
  si error -> redirect("/login?error=invalid_link")
  si ok    -> redirect(next)              // signup -> /onboarding, recovery -> /reset-password
```

- `src/features/auth/actions.ts`:
  - El branch de `!data.session` en `signUp` (mensaje "revisá tu correo para confirmar") ya existe y no cambia — reactivar el toggle de dashboard alcanza para que se dispare de verdad.
  - `requestPasswordReset(_state, formData)`: valida el email con un `forgotPasswordSchema` nuevo en `src/features/auth/schemas.ts`, llama `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.NEXT_PUBLIC_SITE_URL}/auth/confirm?type=recovery&next=/reset-password` })`. Devuelve **siempre** el mismo mensaje genérico exista o no la cuenta (mismo espíritu que `UNKNOWN_USER_EMAIL` en `signIn`, para no filtrar qué emails están registrados).
  - `resetPassword(_state, formData)`: valida la nueva contraseña reusando `PASSWORD_RULES`/`isPasswordValid` de `src/features/auth/password-rules.ts` (no duplicar reglas), llama `supabase.auth.updateUser({ password })` sobre la sesión que dejó `/auth/confirm`, y redirige a `/login` con una notice de éxito.
- Páginas nuevas, mismo patrón de `src/app/(auth)/login/page.tsx` (`Card`/`CardHeader`/`CardContent` + un form client aparte):
  - `src/app/(auth)/forgot-password/page.tsx` + `ForgotPasswordForm.tsx` (`useActionState(requestPasswordReset, undefined)`).
  - `src/app/(auth)/reset-password/page.tsx` + `ResetPasswordForm.tsx` (`useActionState(resetPassword, undefined)`), reusando `PasswordField`/`PasswordStrength` de `RegisterForm.tsx`.
- `LoginForm.tsx`: agregar el link "¿Olvidaste tu contraseña?" hacia `/forgot-password`.
- `src/lib/env.ts`: agregar `NEXT_PUBLIC_SITE_URL`.

## Criterios de aceptación

- [ ] Registrarse sin confirmar el email no otorga sesión ni acceso a `/onboarding`.
- [ ] El link del correo de confirmación lleva a `/auth/confirm`, valida el token y redirige a `/onboarding`.
- [ ] `/forgot-password` acepta cualquier email y siempre muestra el mismo mensaje genérico, exista o no la cuenta.
- [ ] El link del correo de recuperación lleva a `/auth/confirm`, valida el token, establece sesión y redirige a `/reset-password`.
- [ ] `/reset-password` exige que la nueva contraseña cumpla `PASSWORD_RULES`; al confirmar, redirige a `/login`.
- [ ] Un `token_hash` inválido o vencido redirige a `/login?error=invalid_link` sin romper la página.
- [ ] `LoginForm` muestra el link a `/forgot-password`.

## Pruebas

- Unitarias: `requestPasswordReset`/`resetPassword` (mock de `supabase.auth`), `forgotPasswordSchema`.
- E2E: flujo completo de registro sin confirmar (bloqueado), y de "olvidé mi contraseña" con un token real generado por Supabase local (o mockeado si el proyecto de test no tiene SMTP configurado).
