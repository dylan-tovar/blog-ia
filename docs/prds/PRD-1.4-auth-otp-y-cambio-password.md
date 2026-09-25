# PRD 1.4 - OTP de registro y cambio de contraseña autenticado

| Campo | Valor |
| :--- | :--- |
| Estado | **Implementado.** `verifySignupOtp`/`resendSignupOtp`/`changePassword` en `src/features/auth/actions.ts`, `/verify` (registro) y el bloque "Contraseña" de `/settings` |
| Padre | [PRD-1 — Autenticación](PRD-1-auth.md) |
| Depende de | [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md) (confirmación/recuperación por link, no se toca), [PRD-1.2](PRD-1.2-auth-security.md) (`signUp`/`requireUser`) |
| Migraciones | Ninguna propia (usa los flujos nativos de Supabase Auth) |
| Código | `src/features/auth/actions.ts`, `src/features/auth/schemas.ts`, `src/features/auth/components/VerifyOtpForm.tsx`, `src/app/(auth)/verify/page.tsx`, `src/features/profile/components/ChangePasswordForm.tsx`, `src/features/profile/components/AccountSettings.tsx` |

## Punto de partida: el issue original estaba desactualizado

El issue que originó este PRD citaba [PRD-1.2](PRD-1.2-auth-security.md) como fuente de que "recuperar contraseña" estaba fuera de alcance, y pedía completar registro con OTP, "olvidé mi contraseña" y cambio de contraseña.

Auditoría al tomar el issue: **"olvidé mi contraseña" ya estaba implementado** desde [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md) (`requestPasswordReset`/`resetPassword`, `/forgot-password`, `/reset-password`, `/auth/confirm`). PRD-1, PRD-1.1 y PRD-1.2 nunca se actualizaron después de ese trabajo y seguían diciendo "no existe" — corregido en esos documentos como parte de este PRD.

El alcance real de este PRD es entonces menor que el del issue original: **OTP de 6 dígitos en el registro** (reemplaza el link de confirmación) y **cambio de contraseña autenticado en `/settings`** (no existía ninguna forma).

## Problema y objetivo

**Problema.** El registro confirma la cuenta con un link de un solo uso (`token_hash` vía `/auth/confirm`); un código de 6 dígitos es más simple de comunicar por soporte y más corto de escribir en móvil. Y una vez logueado, no había ninguna forma de cambiar la contraseña sin pasar por "olvidé mi contraseña" (que exige salir de la sesión y esperar un email).

**Objetivo.** Verificar el registro con un código de 6 dígitos en vez de un link, y dar un flujo de cambio de contraseña dentro de `/settings` para quien ya tiene sesión.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `verifySignupOtp` / `resendSignupOtp`: verificación de registro por código de 6 dígitos | Recuperación de contraseña por link (ya existe, [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md)), no se toca |
| `/verify`: pantalla para ingresar el código | `/auth/confirm` sigue existiendo para `type=recovery`; no se borra |
| `changePassword`: cambio de contraseña autenticado, reautenticando con la contraseña actual | Rate limit propio sobre `verifyOtp`/`signUp`/`resend` (ver más abajo) |
| Bloque "Contraseña" en `AccountSettings` (`/settings`) | Notificar al dueño de la cuenta cuando se cambia la contraseña |

### Por qué no hay rate limiting propio (KISS)

Supabase Auth ya rate-limitea `signUp`, `auth.resend` y `verifyOtp` por IP/email a nivel de proyecto — el mismo motivo por el que [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md) tampoco construyó uno para `resetPasswordForEmail`.

El patrón propio que existe en el repo (`ai_rate_limits` + `ai_rate_limit_hit`, ver [PRD-5.2](PRD-5.2-rate-limit.md)) resuelve un problema distinto: controlar **costo variable** de llamadas a un LLM, con límites de negocio finos (por usuario y globales). Acá no hay costo que controlar, solo abuso de intentos — caso que la plataforma ya cubre. Replicar esa infraestructura (tabla + función `SECURITY DEFINER` + wrapper server-only) para este caso sería resolver con código propio algo que ya resuelve la plataforma: exactamente lo que KISS pide evitar. Si en el futuro se mide que el límite nativo no alcanza, se agrega entonces.

## Cómo funciona

### Paso manual de dashboard (fuera de control de versiones)

**Auth → Email Templates → Confirm signup**: cambiar el template para mostrar `{{ .Token }}` (el código de 6 dígitos) en vez de `{{ .ConfirmationURL }}`. Supabase genera el mismo token en los dos formatos: la única diferencia es qué parte del email se usa. El template de "Reset password" no cambia — sigue siendo el link que consume `/auth/confirm?type=recovery`.

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

- `/auth/confirm/route.ts` no se modifica: sigue resolviendo `type=recovery` para el flujo de reset. Ya no recibe tráfico de `type=signup` una vez cambiado el template, pero no hace falta borrar el `type` de su lista.
- El código vencido o incorrecto no revela cuál de las dos cosas pasó (mismo espíritu que el resto de auth: mensajes genéricos).

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
| `changePassword` reautentica con la contraseña actual | Confiar solo en la sesión activa, como `resetPassword` | Una sesión abierta en un dispositivo ajeno no alcanza para cambiar la clave. Costo: una llamada extra a `signInWithPassword` |
| Sin rate limiting propio | Replicar el patrón de `ai_rate_limits` | Menos código para mantener; se apoya en un límite que la plataforma ya aplica. Riesgo: si el límite nativo no alcanza, hay que medirlo y revisar esta decisión |
| `/auth/confirm` no se toca | Unificar también la verificación de signup ahí | El flujo de recovery (que sí sigue siendo link) no se rompe; menos superficie de cambio |

## Criterios de aceptación

- [ ] Registrarse redirige a `/verify?email=...` cuando `Confirm email` está activo, en vez de mostrar el mensaje "revisá tu correo".
- [ ] Un código de 6 dígitos correcto en `/verify` crea la sesión y redirige a `/onboarding`.
- [ ] Un código incorrecto o vencido muestra "El código es inválido o venció. Pedí uno nuevo." sin romper la página.
- [ ] "Reenviar código" dispara un nuevo email y muestra una notice de éxito.
- [ ] `/verify` sin `email` en la query redirige a `/register`.
- [ ] El flujo de "olvidé mi contraseña" (`/forgot-password` → `/reset-password`) sigue funcionando sin cambios.
- [ ] Desde `/settings`, cambiar la contraseña con la actual correcta actualiza la contraseña y muestra éxito.
- [ ] Desde `/settings`, cambiar la contraseña con la actual incorrecta muestra "La contraseña actual es incorrecta." y no llama a `updateUser`.
- [ ] La nueva contraseña exige las mismas `PASSWORD_RULES` que el registro.

## Pruebas

- Unitarias: `verifyOtpSchema`, `changePasswordSchema` (`src/features/auth/schemas.test.ts`).
- Manual: ver el flujo end-to-end descrito en el plan de implementación — registro → código → `/onboarding`; reenvío de código; cambio de contraseña con clave correcta e incorrecta; confirmar que `/forgot-password` sigue intacto.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Tests unitarios para `verifySignupOtp`/`resendSignupOtp`/`changePassword` con el cliente de Supabase simulado (hoy solo hay tests de schemas) | M |
| E2E del flujo de registro con OTP y del cambio de contraseña | M |
| Medir si el rate limit nativo de Supabase alcanza en producción; si no, revisar la decisión de no construir uno propio | B |
