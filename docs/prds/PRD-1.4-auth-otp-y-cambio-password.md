# PRD 1.4 - OTP de registro, recuperación por código y cambio de contraseña autenticado

| Campo | Valor |
| :--- | :--- |
| Estado | **Implementado.** `verifySignupOtp`/`resendSignupOtp`/`verifyRecoveryOtp`/`resendPasswordResetOtp`/`changePassword` en `src/features/auth/actions.ts`, `/verify` (registro y recuperación) y el bloque "Contraseña" de `/settings` |
| Padre | [PRD-1 — Autenticación](PRD-1-auth.md) |
| Depende de | [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md) (recuperación por link, **superada por este PRD** — ver abajo), [PRD-1.2](PRD-1.2-auth-security.md) (`signUp`/`requireUser`) |
| Migraciones | Ninguna propia (usa los flujos nativos de Supabase Auth) |
| Código | `src/features/auth/actions.ts`, `src/features/auth/schemas.ts`, `src/features/auth/components/VerifyOtpForm.tsx`, `src/app/(auth)/verify/page.tsx`, `src/features/auth/components/ForgotPasswordForm.tsx`, `src/features/profile/components/ChangePasswordForm.tsx`, `src/features/profile/components/AccountSettings.tsx` |

## Punto de partida: el issue original estaba desactualizado

El issue que originó este PRD citaba [PRD-1.2](PRD-1.2-auth-security.md) como fuente de que "recuperar contraseña" estaba fuera de alcance, y pedía completar registro con OTP, "olvidé mi contraseña" y cambio de contraseña.

Auditoría al tomar el issue: **"olvidé mi contraseña" ya estaba implementado** desde [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md) (`requestPasswordReset`/`resetPassword`, `/forgot-password`, `/reset-password`, `/auth/confirm`). PRD-1, PRD-1.1 y PRD-1.2 nunca se actualizaron después de ese trabajo y seguían diciendo "no existe" — corregido en esos documentos como parte de este PRD.

El alcance de este PRD terminó siendo más amplio de lo previsto en la primera versión: además de **OTP de 6 dígitos en el registro** y **cambio de contraseña autenticado en `/settings`**, probar el flujo de recuperación existente reveló que **el link de "olvidé mi contraseña" no es confiable con Gmail** (ver más abajo), así que también se migró a código de 6 dígitos.

## Problema y objetivo

**Problema.** El registro confirmaba la cuenta con un link de un solo uso (`token_hash` vía `/auth/confirm`); un código de 6 dígitos es más simple de comunicar por soporte y más corto de escribir en móvil. Además, probando "olvidé mi contraseña" (PRD-11.1) en producción, el link llegaba ya consumido: Gmail (y escáneres de seguridad corporativos como Microsoft Safe Links) visitan automáticamente los links de un email para chequearlos por seguridad, y como el token de Supabase es de un solo uso, ese escaneo lo gasta antes de que el usuario haga click — el usuario ve "Email link is invalid or has expired" (`otp_expired`) en el primer intento, siempre. Es un problema [documentado por Supabase](https://supabase.com/docs/guides/troubleshooting/otp-verification-failures-token-has-expired-or-otp_expired-errors-5ee4d0), no un bug de configuración. Y una vez logueado, no había ninguna forma de cambiar la contraseña sin pasar por "olvidé mi contraseña".

**Objetivo.** Verificar el registro y la recuperación de contraseña con un código de 6 dígitos en vez de un link (que un escaneo automático no puede escribir en un formulario), y dar un flujo de cambio de contraseña dentro de `/settings` para quien ya tiene sesión.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `verifySignupOtp` / `resendSignupOtp`: verificación de registro por código de 6 dígitos | Rate limit propio sobre `verifyOtp`/`signUp`/`resend`/`resetPasswordForEmail` (ver más abajo) |
| `verifyRecoveryOtp` / `resendPasswordResetOtp`: recuperación de contraseña por código de 6 dígitos, reemplaza el link de PRD-11.1 | Notificar al dueño de la cuenta cuando se cambia la contraseña |
| `/verify?type=signup\|recovery`: misma pantalla para ambos flujos, `VerifyOtpForm` parametrizado | — |
| `changePassword`: cambio de contraseña autenticado, reautenticando con la contraseña actual | — |
| Bloque "Contraseña" en `AccountSettings` (`/settings`) | — |

### Por qué no hay rate limiting propio (KISS)

Supabase Auth ya rate-limitea `signUp`, `auth.resend` y `verifyOtp` por IP/email a nivel de proyecto — el mismo motivo por el que [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md) tampoco construyó uno para `resetPasswordForEmail`.

El patrón propio que existe en el repo (`ai_rate_limits` + `ai_rate_limit_hit`, ver [PRD-5.2](PRD-5.2-rate-limit.md)) resuelve un problema distinto: controlar **costo variable** de llamadas a un LLM, con límites de negocio finos (por usuario y globales). Acá no hay costo que controlar, solo abuso de intentos — caso que la plataforma ya cubre. Replicar esa infraestructura (tabla + función `SECURITY DEFINER` + wrapper server-only) para este caso sería resolver con código propio algo que ya resuelve la plataforma: exactamente lo que KISS pide evitar. Si en el futuro se mide que el límite nativo no alcanza, se agrega entonces.

## Cómo funciona

### Paso manual de dashboard (fuera de control de versiones)

**Auth → Email Templates → Confirm signup** y **Auth → Email Templates → Reset Password**: cambiar los dos templates para mostrar `{{ .Token }}` (el código de 6 dígitos) en vez de `{{ .ConfirmationURL }}`. Supabase genera el mismo token en los dos formatos: la única diferencia es qué parte del email se usa. **Auth → Sign In / Providers → Email → OTP Length**: dejarlo en 6 (default; puede quedar en un valor distinto de una configuración anterior).

Documentar este paso junto a los de [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md) en `docs/guides/getting-started.md`.

### Registro con OTP

```text
signUp (features/auth/actions.ts)
1. registerSchema.safeParse(formData)
2. supabase.auth.signUp({ email, password })
3. sin data.session -> redirect(`/verify?email=${email}`)   // antes: notice "revisá tu correo"
4. con data.session  -> redirect("/onboarding")              // Confirm email desactivado

/verify?email=...  (src/app/(auth)/verify/page.tsx)
  sin email en la query -> redirect("/register")
  VerifyOtpForm: input de 6 dígitos + botón "Reenviar código"

verifySignupOtp(_state, formData)
1. verifyOtpSchema.safeParse({ email, token })   // token: regex ^\d{6}$
2. supabase.auth.verifyOtp({ email, token, type: "signup" })
3. error -> "El código es inválido o venció. Pedí uno nuevo."
4. ok    -> redirect("/onboarding")               // misma sesión que dejaba el link

resendSignupOtp(_state, formData)
1. forgotPasswordSchema.safeParse({ email })       // reusa el schema existente, es solo un email
2. supabase.auth.resend({ type: "signup", email })
3. siempre { notice: "Te enviamos un código nuevo." } salvo error de red/Supabase
```

- `/auth/confirm/route.ts` se mantiene (para `invite`/`email_change`, que siguen siendo por link) pero ya no recibe tráfico de `type=signup` ni `type=recovery` una vez cambiados los templates.
- El código vencido o incorrecto no revela cuál de las dos cosas pasó (mismo espíritu que el resto de auth: mensajes genéricos).

### Recuperación de contraseña con OTP (reemplaza el link de PRD-11.1)

```text
requestPasswordReset (features/auth/actions.ts) — ForgotPasswordForm
1. forgotPasswordSchema.safeParse({ email })
2. supabase.auth.resetPasswordForEmail(email)        // sin redirectTo: ya no hay link que seguir
3. redirect(`/verify?type=recovery&email=${email}`)  // siempre, exista o no la cuenta

/verify?type=recovery&email=...
  mismo VerifyOtpForm que signup, con verifyType="recovery"
  a diferencia de signup, NO redirige si hay sesión activa: alguien ya logueado
  puede legítimamente estar recuperando su clave (otro dispositivo/pestaña)

verifyRecoveryOtp(_state, formData)
1. verifyOtpSchema.safeParse({ email, token })
2. supabase.auth.verifyOtp({ email, token, type: "recovery" })
3. error -> "El código es inválido o venció. Pedí uno nuevo."
4. ok    -> redirect("/reset-password")               // misma sesión que dejaba el link

resendPasswordResetOtp(_state, formData)
1. forgotPasswordSchema.safeParse({ email })
2. supabase.auth.resetPasswordForEmail(email)
3. siempre { notice: "Si existe una cuenta con ese email, te enviamos un código..." }
```

- `resetPassword` (el `updateUser({ password })` final en `/reset-password`) no cambia — sigue dependiendo únicamente de la sesión que deja `verifyOtp`, igual que antes dependía de la sesión que dejaba el link.
- `requestPasswordReset` y `resendPasswordResetOtp` hacen la misma llamada a Supabase; se mantienen separadas (en vez de una función compartida) porque una redirige y la otra devuelve estado — mismo patrón que `signUp` vs `resendSignupOtp`.

### Cambio de contraseña en `/settings`

```text
changePassword (features/auth/actions.ts)
1. changePasswordSchema.safeParse({ currentPassword, newPassword, confirmNewPassword })
2. requireUser()                                          -> sin sesión, redirect("/login")
3. supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
   error -> "La contraseña actual es incorrecta."
4. supabase.auth.updateUser({ password: newPassword })
5. { success: true }
```

- Reautenticar con la contraseña actual antes de dejar cambiarla: una sesión abierta en un dispositivo ajeno no alcanza por sí sola (decisión explícita, más estricta que `resetPassword`, que solo depende de la sesión que dejó el link porque ya pasó por el email).
- `newPassword` reusa `PASSWORD_RULES`/`isPasswordValid` de `password-rules.ts`, igual que `registerSchema`/`resetPasswordSchema` — no se duplican las reglas.
- UI: nueva fila "Contraseña" en la sección Account de `AccountSettings`, abre el mismo `Drawer` que "Profile"/"Handle" con `ChangePasswordForm` (reusa `PasswordField`/`PasswordStrength` de `features/auth/components/`).

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| OTP de 6 dígitos en vez de link para el registro | Mantener el link (ya funcionaba) | Más simple de comunicar/escribir en móvil. Costo: nueva pantalla `/verify` y dos actions nuevas |
| OTP de 6 dígitos en vez de link para la recuperación | Mitigar el prefetching (headers, `rel=noreferrer`, avisar al usuario) | El código no puede ser "clickeado" por un escáner automático — resuelve el bug de raíz en vez de mitigarlo. Costo: se reescribe un flujo que ya estaba implementado (PRD-11.1) |
| `changePassword` reautentica con la contraseña actual | Confiar solo en la sesión activa, como dejaba el link viejo | Una sesión abierta en un dispositivo ajeno no alcanza para cambiar la clave. Costo: una llamada extra a `signInWithPassword` |
| Sin rate limiting propio | Replicar el patrón de `ai_rate_limits` | Menos código para mantener; se apoya en un límite que la plataforma ya aplica. Riesgo: si el límite nativo no alcanza, hay que medirlo y revisar esta decisión |
| `/verify` no redirige por sesión activa cuando `verifyType="recovery"` | Aplicar el mismo guard que a signup (redirigir si hay sesión) | Un usuario logueado puede legítimamente estar recuperando su clave desde otra pestaña/dispositivo; para signup en cambio, una sesión activa significa que ya se confirmó y el código no puede volver a usarse |

## Criterios de aceptación

- [ ] Registrarse redirige a `/verify?email=...` cuando `Confirm email` está activo, en vez de mostrar el mensaje "revisá tu correo".
- [ ] Un código de 6 dígitos correcto en `/verify` crea la sesión y redirige a `/onboarding`.
- [ ] Un código incorrecto o vencido muestra "El código es inválido o venció. Pedí uno nuevo." sin romper la página.
- [ ] "Reenviar código" dispara un nuevo email y muestra una notice de éxito.
- [ ] `/verify` sin `email` en la query redirige a `/register` (signup) o `/forgot-password` (recovery).
- [ ] "Olvidé mi contraseña" redirige a `/verify?type=recovery&email=...` en vez de mostrar un mensaje inline; un código correcto lleva a `/reset-password`.
- [ ] Desde `/settings`, cambiar la contraseña con la actual correcta actualiza la contraseña y muestra éxito.
- [ ] Desde `/settings`, cambiar la contraseña con la actual incorrecta muestra "La contraseña actual es incorrecta." y no llama a `updateUser`.
- [ ] La nueva contraseña exige las mismas `PASSWORD_RULES` que el registro.

## Pruebas

- Unitarias: `verifyOtpSchema`, `changePasswordSchema` (`src/features/auth/schemas.test.ts`).
- Manual: ver el flujo end-to-end descrito en el plan de implementación — registro → código → `/onboarding`; reenvío de código; cambio de contraseña con clave correcta e incorrecta; confirmar que `/forgot-password` sigue intacto.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Tests unitarios para las actions (`verifySignupOtp`/`resendSignupOtp`/`verifyRecoveryOtp`/`resendPasswordResetOtp`/`changePassword`) con el cliente de Supabase simulado (hoy solo hay tests de schemas) | M |
| E2E del flujo de registro y recuperación con OTP y del cambio de contraseña | M |
| Medir si el rate limit nativo de Supabase alcanza en producción; si no, revisar la decisión de no construir uno propio | B |
