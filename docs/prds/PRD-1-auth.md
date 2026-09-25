# PRD 1 — Autenticación, perfiles y modelo de datos base

| Campo | Valor |
| :--- | :--- |
| Estado | Implementado. Incluye el username (login por email o username), que **no tiene PRD propio: vive en este documento** |
| Depende de | [PRD 0](PRD-0-design-system.md) |
| Migraciones | `0001_profiles.sql`, `0004_username.sql`, `0010_onboarding_interests.sql` |
| ADRs relacionados | [0002](../adr/0002-un-solo-tipo-de-usuario.md), [0003](../adr/0003-seguridad-rls-y-proxy-minimo.md), [0007](../adr/0007-login-por-username-con-secret-key.md), [0024](../adr/0024-perfil-en-onboarding.md), [0025](../adr/0025-intereses-en-onboarding.md) |
| Código | `src/features/auth/`, `src/features/profile/`, `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/viewer.ts`, `src/lib/supabase/`, `src/app/(auth)/`, `src/app/(dashboard)/settings/`, `src/app/(dashboard)/profile/` |

## Paquetes de trabajo

Este PRD se reparte en tres paquetes que se pueden asignar por separado ([reparto del equipo](../team/reparto-de-tareas.md)).

| Paquete | Qué cubre | Dificultad | Esfuerzo |
| :--- | :--- | :--- | :--- |
| [PRD-1.1 — Formularios de registro y login](PRD-1.1-auth-forms.md) | `LoginForm`, `RegisterForm`, `LoginDrawer`, schemas de Zod | B | M |
| [PRD-1.2 — Seguridad de autenticación](PRD-1.2-auth-security.md) | Acciones `signUp`/`signIn`/`signOut`, `completeOnboarding`, username → email, `proxy.ts`, RLS de `profiles` | A | L |
| [PRD-1.3 — Perfil y ajustes de cuenta](PRD-1.3-profile-settings.md) | `/settings`, `updateProfile`, `/profile` | B | S |

## Resumen

Una persona se registra con **email y contraseña (fuerte y con confirmación)**, completa el onboarding en `/onboarding` en dos pasos (1: **nombre para mostrar y nombre de usuario (`username`)**; 2: **al menos 3 temas de interés**), inicia sesión con **email o username**, y edita su nombre y username desde `/settings`. Las políticas RLS de `profiles` quedan definidas aquí porque todos los PRDs siguientes las heredan. El username existe para dar una identidad pública corta (`@usuario`); como Supabase solo autentica por email, se resuelve a email **en el servidor** sin exponer nunca el email.

## Problema y objetivo

* Un usuario puede registrarse, iniciar y cerrar sesión.
* Al terminar el paso 1 del onboarding que sigue al registro se crea su fila en `profiles`; el onboarding termina al completar el paso 2 (intereses).
* Puede ver y editar su perfil (nombre para mostrar y username).
* Las rutas privadas son inaccesibles sin sesión.
* Se puede iniciar sesión con el username, sin filtrar los emails de los demás (`profiles` es pública).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Registro, login (email o username), logout | Roles de usuario ([ADR 0002](../adr/0002-un-solo-tipo-de-usuario.md)) |
| `profiles` con `display_name` y `username` únicos | Login social, panel de administración |
| Edición de nombre y username en `/settings` | **Subida de avatar** (`avatar_url` existe en la tabla y no se usa) |
| Protección de rutas privadas | Edición real del email (ver limitaciones) |
| Verificación de email | Solo la que traiga por defecto la configuración de Supabase Auth: la app no la exige ni la gestiona |

## Cómo funciona

### Registro (`signUp`, `src/features/auth/actions.ts`)

```mermaid
flowchart TD
  F[Formulario: email, contraseña, confirmación] --> Z{Zod registerSchema}
  Z -->|inválido| E1[Mensaje en el formulario]
  Z -->|válido| A[supabase.auth.signUp]
  A -->|user_already_exists| E3["Ya existe una cuenta con este email."]
  A -->|otro error| E4["No pudimos crear tu cuenta."]
  A -->|ok| R[redirect a /onboarding]
```

* **Validación** (`src/features/auth/schemas.ts`): email válido, contraseña fuerte (8 o más caracteres, minúscula, mayúscula, número y símbolo, estos cuatro solo ASCII porque la política de Supabase no reconoce otros caracteres, y como máximo 72 bytes por el límite de bcrypt; reglas en `password-rules.ts`, compartidas con el indicador del formulario) y confirmación idéntica ("Las contraseñas no coinciden.", error sobre `confirmPassword`). `loginSchema` **no** aplica estas reglas a propósito: las cuentas creadas antes deben poder seguir entrando.
* `signUp` **no crea el perfil**: solo la cuenta en Auth. No hay trigger en la base.

### Onboarding (`completeOnboarding`, `src/features/profile/actions.ts`)

Página `/onboarding` en dos pasos, con un indicador de paso (`OnboardingSteps`). **Cuál se muestra lo decide la base**, no la URL: sin fila de `profiles`, paso 1; con perfil y `onboarded_at` en `null`, paso 2; con `onboarded_at`, redirige a `/`. Un refresco o volver más tarde retoma donde se dejó. Incluye un botón "Cerrar sesión" en ambos pasos.

**Paso 1** (`OnboardingForm`): nombre para mostrar y username (`onboardingSchema`; el username usa `^[a-z0-9_]{3,20}$` y se normaliza a minúsculas).

* Con sesión (`requireUser`) y datos válidos, **inserta** la fila de `profiles` (`id = auth.uid()`, bajo RLS) y redirige a `/onboarding`, que pasa a mostrar el paso 2. Si el perfil ya existe, redirige a `/onboarding` sin tocarlo.
* Ante un conflicto `23505` vuelve a consultar el perfil: si existe (doble envío) redirige a `/onboarding`; si no, el username está tomado: "Ese nombre de usuario ya está en uso.". La unicidad la garantiza el índice, sin chequeo previo.
* Quien tiene sesión pero no completó el onboarding solo puede ver `/onboarding` (lo fuerza el proxy, ver más abajo). Decisión y alternativas en el [ADR 0024](../adr/0024-perfil-en-onboarding.md) y el [ADR 0025](../adr/0025-intereses-en-onboarding.md).

**Paso 2** (`InterestsForm`, `saveInterests` en `src/features/interests/actions.ts`): chips con los 30 tags más usados de artículos publicados (`popular_tags`), con un contador de selección. **Es obligatorio**: mínimo 3 y máximo 20 (`INTERESTS_MIN`/`INTERESTS_MAX`). El mínimo se relaja a la cantidad de tags elegibles cuando hay menos de 3, y a 0 si no hay ninguno. Si la lista de tags no carga, se muestra un error con reintento (no se deja pasar). `saveInterests` recalcula los tags elegibles en el servidor, valida la selección (`validateSelection`), guarda la diferencia en `user_interests` (`planInterestChanges`, así los reintentos son seguros), marca `profiles.onboarded_at` y redirige a `/`. Los intereses son privados (RLS de fila propia) y alimentan las recomendaciones ([PRD-4](PRD-4-recommendations.md)).

### Inicio de sesión (`signIn`)

```text
identificador = campo "email o usuario"
si contiene "@"  -> es un email
si no            -> es un username: se pasa a minúsculas y se resuelve a email en el servidor
                    (RPC login_email_for_username con la secret key)
si el username no existe -> se llama igual a signInWithPassword con una dirección reservada
                            (unknown-user@example.invalid) para que el tiempo de respuesta
                            no revele qué usernames existen
cualquier fallo de credenciales -> "Credenciales inválidas." (mismo mensaje siempre)
éxito -> redirect a la ruta pedida (resolveAuthRedirect) o a /
```

Un username no puede contener `@` (lo impide `usernameSchema`), así que no hay ambigüedad entre email y username. Si falla la consulta de resolución (por ejemplo, falta `SUPABASE_SECRET_KEY`), el mensaje es "No pudimos iniciar sesión. Intentá de nuevo.". El login por **email** funciona sin la secret key.

### Cierre de sesión

`signOut` llama a `supabase.auth.signOut()` y redirige a `/login`.

### Protección de rutas

`src/proxy.ts` (Next.js 16; reemplaza a `middleware`) corre en cada request salvo estáticos e imágenes:

1. Crea un cliente `@supabase/ssr` con las cookies del request y llama a `auth.getUser()`, lo que **refresca la sesión**.
2. Si la ruta empieza con **`/settings`, `/editor`, `/posts` o `/onboarding`** y no hay usuario, redirige a `/login`.
3. En cada `GET` de página (no `POST`, no `/api`) de un usuario con sesión hace **una consulta `select id, onboarded_at` a `profiles`** y deriva el estado del onboarding (`none`, `interests` o `done`): si no es `done`, redirige a `/onboarding`; con `done`, `/onboarding` redirige a `/`. Si la consulta falla, deja pasar y lo registra en el log. La decisión es la función pura `getGateRedirect` (`src/features/auth/onboarding-gate.ts`).

La protección **no se deriva de los grupos de ruta** (`(dashboard)`, etc.): depende de esa lista (`PROTECTED_PATHS`, en `onboarding-gate.ts`). `/profile` y `/activity` **no** están en la lista; cada página llama a `redirect("/login")` si no hay sesión. Las rutas `/api/ai/*` **sí pasan por el proxy** (el `matcher` solo excluye estáticos e imágenes, así que también refresca la sesión ahí), pero no están en `PROTECTED_PATHS`: no las redirige a `/login`. Autentican por su cuenta y devuelven 401 en JSON.

Las Server Actions que escriben usan `requireUser()` (`src/lib/auth.ts`), que redirige a `/login` sin sesión. `getViewer()` (`src/lib/viewer.ts`) devuelve el usuario y su nombre, cacheado por request.

### Perfil, ajustes y `/profile`

| Ruta | Qué hace |
| :--- | :--- |
| `/settings` | `AccountSettings`: filas Profile, Email y Handle. **Solo Profile y Handle son reales:** abren `SettingsForm` (nombre + username) y guardan con `updateProfile`. El email se muestra, no se edita |
| `/profile` | Redirige a `/author/<id propio>`, o a `/login` sin sesión. El perfil propio es la vista pública del autor ([PRD-3](PRD-3-feed-follows.md)) |

`updateProfile` valida con `updateProfileSchema`; un conflicto de unicidad (código `23505`) se traduce a "Ese nombre de usuario ya está en uso.". El username se puede cambiar cuando se quiera, y el login funciona con el nuevo de inmediato.

## Datos

### Tabla `profiles`

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | `uuid` | PK, igual al `id` de `auth.users` (`on delete cascade`) |
| `display_name` | `text` | Nombre visible. Obligatorio |
| `username` | `text` | Único, `NOT NULL`, `CHECK` con `^[a-z0-9_]{3,20}$`. Migración `0004`: los perfiles previos recibieron `user_<8 hex>` |
| `avatar_url` | `text`, nullable | Reservado; hoy solo se muestran iniciales |
| `created_at` | `timestamptz` | Default `now()` |

### Función `login_email_for_username(p_username text)`

`SECURITY DEFINER`, `search_path` vacío, ejecutable **solo por `service_role`** (se revoca de `public`, `anon` y `authenticated`). Devuelve el email de un username. No puede ser ejecutable por el cliente: `profiles` es pública, y cualquiera obtendría el email de cualquier usuario.

### RLS de `profiles`

| Acción | Regla |
| :--- | :--- |
| SELECT | Público (`using (true)`): son datos de un perfil de autor |
| INSERT | Solo una fila con `id = auth.uid()` |
| UPDATE | Solo el dueño (`auth.uid() = id`) |
| DELETE | No hay política: no existe borrado de cuenta en el alcance |

### Variables de entorno

| Variable | Para qué |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clientes de Supabase (validadas al arrancar) |
| `SUPABASE_SECRET_KEY` | Solo el login por username y otras escrituras de servidor (ver PRD-5). Salta RLS, es `server-only`, nunca llega al navegador |

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Resolver username → email en el servidor** con una función solo `service_role` ([ADR 0007](../adr/0007-login-por-username-con-secret-key.md)) | Guardar el email en `profiles` (es público: lo filtra); función RPC ejecutable por `anon` (cualquiera obtiene el email); login solo por email (no cumple el pedido) | El email nunca sale del servidor. Costo: hay una segunda clave que proteger |
| **Mensaje único "Credenciales inválidas." y una llamada a Auth aun para usernames inexistentes** | Mensajes distintos ("usuario no existe"); devolver antes | No se pueden enumerar usuarios por mensaje ni por tiempo de respuesta |
| **Crear el perfil en `/onboarding`, no en `signUp`** ([ADR 0024](../adr/0024-perfil-en-onboarding.md)) | Trigger en `auth.users`; insertar el perfil en `signUp` con todos los datos | Registro de tres campos, sin cuentas huérfanas por un username repetido. Costo: una cuenta puede existir sin perfil, y el proxy hace una consulta por navegación para retenerla en `/onboarding`. Desde el [ADR 0025](../adr/0025-intereses-en-onboarding.md) la puerta usa `profiles.onboarded_at`: tener perfil ya no alcanza. Si se migra a un trigger, el [ADR 0007](../adr/0007-login-por-username-con-secret-key.md) lo marca como motivo para revisar el login por username |
| **Paso 2 obligatorio (mínimo 3 intereses), con estado en la base** ([ADR 0025](../adr/0025-intereses-en-onboarding.md)) | Paso opcional; estado en la URL o en una cookie; columna de arreglo en `profiles` | Recomendaciones con señal desde el primer día. Costo: un paso más al registrarse y tags de texto libre (con errores de tipeo o duplicados) visibles en el onboarding |
| **`INSERT` con re-consulta ante `23505`**, no `upsert` ni chequeo previo | `upsert`; `isUsernameAvailable` antes de insertar | Nunca pisa un perfil existente y no depende del nombre del índice; la carrera la resuelve el índice único |
| **`proxy.ts` con lista de prefijos, no por grupo de ruta** ([ADR 0003](../adr/0003-seguridad-rls-y-proxy-minimo.md)) | Verificar sesión en cada layout; roles en el proxy | Es UX (redirigir), no seguridad: la seguridad real es RLS. Costo: cada ruta privada nueva debe agregarse a la lista o guardarse a sí misma |
| **Un solo tipo de usuario** ([ADR 0002](../adr/0002-un-solo-tipo-de-usuario.md)) | Roles autor/lector | Sin flujos de conversión; "autor" es un estado derivado |

## Criterios de aceptación

- [x] Un usuario nuevo se registra con email y una contraseña fuerte (con confirmación), completa nombre y usuario (paso 1) y elige al menos 3 temas (paso 2) en `/onboarding`, termina en `/` y tiene una fila en `profiles` con `onboarded_at`.
- [x] Quien tiene sesión y no completó el onboarding (sin perfil, o con perfil y sin intereses) es llevado a `/onboarding` desde cualquier página, al paso que le toca; quien ya lo completó es llevado de `/onboarding` a `/`.
- [x] El paso 2 no se puede completar con menos de 3 temas (salvo que haya menos tags disponibles) ni con temas que el servidor no ofrece.
- [x] Puede iniciar sesión con su email **o** con su username (sin distinguir mayúsculas), y el mismo error genérico aparece con contraseña incorrecta, usuario inexistente o email inexistente.
- [x] Un username o email repetido muestra un mensaje amable (no el error crudo de Supabase).
- [x] `/settings`, `/editor`, `/posts` y `/onboarding` redirigen a `/login` sin sesión; `/profile` y `/activity` también, por su cuenta.
- [x] Cambiar el username en `/settings` funciona, y un username ajeno da "Ese nombre de usuario ya está en uso.".
- [x] Un usuario no puede editar el perfil de otro (RLS).
- [x] Cerrar sesión re-protege las rutas privadas y lleva a `/login`.

## Limitaciones conocidas y deuda

| Tema | Detalle |
| :--- | :--- |
| Email "Edit" | El botón abre un panel informativo; no hay cambio de email |
| **Confirmación de email de Supabase** | Si el proyecto la exige (en el real estaba activada), `signUp` no devuelve sesión: se muestra un aviso en vez de ir a `/onboarding`. Para el flujo directo hay que desactivar "Confirm email" en el dashboard ([ADR 0024](../adr/0024-perfil-en-onboarding.md)) |
| Abandono del onboarding | Quien no completa `/onboarding` queda retenido ahí: solo puede completar el paso pendiente o cerrar sesión |
| Migración `0010` sin aplicar | Se aplica a mano antes de desplegar ([ADR 0025](../adr/0025-intereses-en-onboarding.md)). Sin ella `/onboarding` muestra el paso 1 a todos, el paso 2 no funciona y el proxy falla abierto |
| Tags de texto libre | La oferta del paso 2 sale de tags creados por usuarios sin moderación: puede haber errores de tipeo o duplicados |
| Sin edición de intereses | Después del onboarding no hay pantalla para cambiar los intereses |
| Costo del proxy | Una consulta a `profiles` por cada `GET` de página con sesión, incluidos los prefetch |
| Textos en inglés | `AccountSettings` usa "Account", "Profile", "Edit", "Handle", "Publications" |
| Contador "Publications" engañoso | Cuenta todos los artículos del autor (`type = 'article'`), incluidos borradores y rechazados, porque `src/app/(dashboard)/settings/page.tsx` no filtra por `status`. Ver [PRD-1.3](PRD-1.3-profile-settings.md) |
| Sin avatar | `avatar_url` existe en la tabla y `getCurrentProfile` lo selecciona, pero ninguna pantalla lo muestra ni hay subida; solo iniciales |
| ~~Sin recuperación de contraseña~~ (resuelto) | Implementado en [PRD-11.1](PRD-11.1-confirmacion-y-recuperacion.md); OTP de registro y cambio de contraseña autenticado en [PRD-1.4](PRD-1.4-auth-otp-y-cambio-password.md) |
| Sin borrado de cuenta | Ver RLS: no hay política DELETE |

## Pruebas

| Tipo | Archivo | Cubre |
| :--- | :--- | :--- |
| Unitarias | `src/features/auth/schemas.test.ts`, `src/features/auth/onboarding-gate.test.ts`, `src/features/profile/schemas.test.ts`, `src/features/interests/schemas.test.ts`, `src/features/interests/selection.test.ts` | Validación de registro, login, username, perfil y onboarding, `resolveAuthRedirect`, la puerta del proxy (estados `none`/`interests`/`done`) y la selección de intereses (validación, mínimo relajado, contador y diferencias) |
| e2e | `e2e/auth.spec.ts` | Protección de rutas (incluye `/onboarding`), registro con onboarding en dos pasos, redirecciones según el estado del onboarding, login por email y por username (incluye mayúsculas), errores genéricos, email/username duplicados, cambio de username en `/settings` y login con el nuevo |
