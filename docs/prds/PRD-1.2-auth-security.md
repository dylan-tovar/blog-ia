# PRD-1.2 — Seguridad de autenticación (acciones, proxy y username → email)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-1 — Autenticación](PRD-1-auth.md) |
| Dificultad | A (avanzada) |
| Esfuerzo | L (4 puntos, más de 3 días) |
| Dueño sugerido | D1 |
| Mentor | — |
| Depende de | Supabase Auth y RLS de `profiles` (migración `0001`) |
| Código | `src/features/auth/actions.ts`, `src/features/auth/queries.ts`, `src/features/auth/onboarding-gate.ts`, `src/features/profile/actions.ts` (`completeOnboarding`), `src/features/interests/actions.ts` (`saveInterests`), `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/viewer.ts`, `src/lib/supabase/{server,client,admin}.ts`, `src/lib/env.ts`, `src/lib/env.server.ts`, `supabase/migrations/0001_profiles.sql`, `supabase/migrations/0004_username.sql`, `supabase/migrations/0010_onboarding_interests.sql` |
| ADRs | [0002](../adr/0002-un-solo-tipo-de-usuario.md), [0003](../adr/0003-seguridad-rls-y-proxy-minimo.md), [0007](../adr/0007-login-por-username-con-secret-key.md), [0024](../adr/0024-perfil-en-onboarding.md), [0025](../adr/0025-intereses-en-onboarding.md) |

## Resumen

La parte del sistema donde una equivocación es un problema de seguridad: cómo se crea una cuenta y su perfil sin dejar datos a medias, cómo se inicia sesión con **email o username** sin revelar qué usuarios existen ni exponer emails, cómo se refresca la sesión y qué rutas quedan protegidas. Toda la seguridad **de datos** la hace RLS en la base; el `proxy.ts` solo redirige (es UX, no seguridad).

## Qué necesitás entender antes

- [ ] Cómo funciona Supabase Auth: `signUp`, `signInWithPassword`, sesión guardada en **cookies** y refresco de sesión.
- [ ] Qué es **RLS** (Row Level Security) y por qué `profiles` tiene una política `SELECT ... using (true)`.
- [ ] Diferencia entre la clave **publishable** (pública, sujeta a RLS) y la **secret key** (`service_role`, salta RLS: solo servidor).
- [ ] Qué es una función SQL `SECURITY DEFINER` y qué hace `revoke ... grant execute`.
- [ ] Ataques a tener en mente: **enumeración de usuarios** (por mensaje o por tiempo de respuesta) y **open redirect**.
- [ ] Qué son `"use server"`, `server-only` y las cookies en Server Components (no se pueden escribir desde ahí).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `signUp`, `completeOnboarding`, `signIn`, `signOut` | Aspecto y validación de campos del formulario: [PRD-1.1](PRD-1.1-auth-forms.md) |
| `findEmailByUsername` y la función SQL `login_email_for_username` | Edición de perfil: [PRD-1.3](PRD-1.3-profile-settings.md) |
| `proxy.ts`: refresco de sesión, rutas protegidas y la puerta hacia `/onboarding` | Rate limit de la IA (usa también la secret key): [PRD-5.2](PRD-5.2-rate-limit.md) |
| Clientes de Supabase (`server`, `client`, `admin`) y `env` | Políticas RLS de `posts`: [PRD-2.1](PRD-2.1-posts-data-rls.md) |
| RLS de `profiles` | Recuperar contraseña, login social, roles (no existen) |

## Cómo funciona

### 1. Clientes de Supabase

| Archivo | Para qué | Clave |
| :--- | :--- | :--- |
| `lib/supabase/server.ts` | Server Components y Server Actions. Lee y escribe cookies. `setAll` está en `try/catch` porque un Server Component no puede escribir cookies: ahí el refresco lo hace el proxy | publishable |
| `lib/supabase/client.ts` | Navegador. Existe pero **hoy nada lo importa** (una búsqueda de `supabase/client` en `src/`, `e2e/` y `scripts/` no da resultados) | publishable |
| `lib/supabase/admin.ts` | Salta RLS. Marcado `server-only`: si se importa desde un Client Component, el build falla. `persistSession: false` | **secret key** |

`lib/env.ts` valida las dos variables públicas al arrancar. `lib/env.server.ts` valida `SUPABASE_SECRET_KEY` **de forma perezosa** (`getServerEnv()` solo la exige cuando alguien la pide): así, si falta, solo falla el login por username y no todas las páginas que importan las acciones de auth.

### 2. `signUp`, `completeOnboarding` y `saveInterests`

```text
signUp (features/auth/actions.ts)
1. registerSchema.safeParse(formData)          -> si falla, { error } con el primer mensaje (reglas de contraseña incluidas)
2. supabase.auth.signUp({ email, password })   -> user_already_exists = "Ya existe una cuenta con este email."
3. redirect("/onboarding")                     -> no se crea el perfil

completeOnboarding (features/profile/actions.ts)
1. onboardingSchema.safeParse(formData)        -> si falla, { error }
2. requireUser()                               -> sin sesión, redirect("/login")
3. ¿ya hay fila en profiles?                   -> redirect("/onboarding") sin tocarla
4. insert { id, display_name, username }       -> nunca upsert
5. error 23505                                 -> se vuelve a consultar el perfil:
                                                  existe   -> redirect("/onboarding")  (doble envío)
                                                  no existe -> "Ese nombre de usuario ya está en uso."
6. redirect("/onboarding")                     -> la página muestra el paso 2

saveInterests (features/interests/actions.ts)
1. interestsSchema.safeParse(tagIds)          -> si falla, { error }
2. requireUser() y select de profiles          -> sin perfil, redirect("/onboarding"); ya con onboarded_at, redirect("/")
3. getInterestOptions() (popular_tags)         -> recalcula los tags elegibles en el servidor; si falla, { error }
4. validateSelection(tagIds, elegibles)       -> mínimo min(3, elegibles), solo tags ofrecidos
5. diff contra user_interests                  -> delete de los que sobran, upsert (ignoreDuplicates) de los nuevos
6. update profiles set onboarded_at = now()    -> solo donde onboarded_at is null
7. redirect("/")
```

- El perfil lo crea la Server Action con la sesión del propio usuario y bajo RLS (política "Users can insert their own profile"). **No hay trigger** en la base ([ADR 0024](../adr/0024-perfil-en-onboarding.md)). La migración `0010` agrega `profiles.onboarded_at`, `user_interests` y `popular_tags` para el paso 2 ([ADR 0025](../adr/0025-intereses-en-onboarding.md)).
- `saveInterests` no confía en la lista del cliente: recalcula los tags elegibles y valida contra ellos. Las escrituras van con la sesión del usuario y bajo RLS de fila propia (`user_interests`) y sobre su propio perfil. Es idempotente ante reintentos y dobles envíos.
- La unicidad del username la garantiza el índice único; no hay chequeo previo. Como se re-consulta el perfil, no se depende del nombre de la restricción que disparó el `23505`.
- Nunca se llama a `redirect()` dentro de un `try/catch` (lanza una excepción de control de flujo).

### 3. `signIn`

```text
identifier = "usuario" o "email"
si contiene "@"  -> email = identifier
si no            -> email = findEmailByUsername(identifier.toLowerCase())   // RPC con secret key
                    si la búsqueda lanza -> "No pudimos iniciar sesión. Intentá de nuevo."
signInWithPassword({ email: email ?? "unknown-user@example.invalid", password })
si hay error -> "Credenciales inválidas."          // siempre el mismo
si no        -> redirect(resolveAuthRedirect(redirectTo))   // rechaza //, backslash, /login, /register y /onboarding
```

Puntos clave:

- **Usuario inexistente:** `findEmailByUsername` devuelve `null` y se llama igual a `signInWithPassword` con una dirección reservada (`.invalid` es un dominio que nunca existe, RFC 2606). Así la respuesta tarda parecido y dice lo mismo que una contraseña mala: no se puede saber qué usernames existen ni por mensaje ni por tiempo. El código lo describe como la razón del diseño.
- **Login por email** no necesita la secret key.
- **El email nunca sale del servidor:** el navegador solo recibe "Credenciales inválidas." o una redirección.

### 4. La función SQL (`0004_username.sql`)

```sql
create or replace function public.login_email_for_username (p_username text)
returns text language sql stable security definer set search_path = ''
as $$ select u.email::text from public.profiles p join auth.users u on u.id = p.id
      where p.username = lower(p_username) limit 1 $$;
revoke all on function ... from public, anon, authenticated;
grant execute on function ... to service_role;
```

- `security definer`: corre con permisos de su dueño, por eso puede leer `auth.users`, tabla que un usuario común no puede leer.
- `set search_path = ''` evita que alguien cambie qué tablas se resuelven por nombre.
- **Solo `service_role` puede ejecutarla.** Si `anon` o `authenticated` pudieran, cualquiera obtendría el email de cualquier usuario, porque `profiles` es pública.
- La migración también agrega `profiles.username` (`NOT NULL`, `CHECK ^[a-z0-9_]{3,20}$`, índice único). Los perfiles previos recibieron `user_<8 hex>`.

### 5. `proxy.ts` (Next.js 16; reemplaza a `middleware`)

- Corre en **cada petición** salvo estáticos e imágenes (`config.matcher`), incluidas `/api/ai/*`.
- Crea un cliente `@supabase/ssr` con las cookies del request y llama a `auth.getUser()`: eso **refresca la sesión**. Las cookies nuevas se escriben tanto en el request como en la respuesta.
- Si la ruta empieza con `/settings`, `/editor`, `/posts` o `/onboarding` y no hay usuario, redirige a `/login`. Usa `startsWith`, sin comprobar el límite de segmento (una ruta como `/postscript` también contaría).
- **La puerta de onboarding.** En los `GET` de página (no `POST`, no `/api`) de un usuario con sesión hace un `select id, onboarded_at` a `profiles` y deriva el estado (`none`: sin fila; `interests`: fila sin `onboarded_at`; `done`): con cualquier estado distinto de `done` redirige a `/onboarding` (salvo que ya esté ahí); con `done`, `/onboarding` redirige a `/`. Es la misma consulta de antes, sin costo extra ([ADR 0025](../adr/0025-intereses-en-onboarding.md)). Si la consulta falla (por ejemplo, si `0010` no se aplicó), deja pasar y registra el error. La decisión es la función pura `getGateRedirect`, con tests. Las redirecciones copian las cookies renovadas por `getUser()`. Los prefetch no se distinguen de una navegación (Next.js quita esos headers), así que también pagan la consulta.
- **No protege por grupo de ruta**, solo por esa lista `PROTECTED_PATHS`. `/profile` y `/activity` no están: cada página llama a `redirect("/login")`. `/api/ai/*` autentica por su cuenta y responde 401 en JSON.
- Las Server Actions que escriben usan `requireUser()` (`lib/auth.ts`): devuelve el cliente y el usuario o redirige a `/login`.
- `getViewer()` (`lib/viewer.ts`) devuelve `{ id, displayName, username }` cacheado por petición.

### 6. RLS de `profiles` (`0001_profiles.sql`)

| Acción | Regla |
| :--- | :--- |
| SELECT | Cualquiera (`using (true)`): son datos públicos de perfil |
| INSERT | Solo una fila con `id = auth.uid()` |
| UPDATE | Solo el dueño (`using` y `with check` con `auth.uid() = id`) |
| DELETE | Sin política: nadie puede borrar perfiles desde el cliente |

## Decisiones y por qué

| Decisión | Alternativas descartadas | Consecuencia |
| :--- | :--- | :--- |
| **Resolver username → email solo en el servidor** ([ADR 0007](../adr/0007-login-por-username-con-secret-key.md)) | Guardar el email en `profiles` (público: lo filtra); función ejecutable por `anon` | El email no sale del servidor. Costo: una segunda clave que proteger |
| **Mensaje único y llamada a Auth aun con usuario inexistente** | Mensajes por caso; responder antes | No se enumeran usuarios por texto ni por tiempo |
| **Secret key con lectura perezosa** | Validar al arrancar | Sin la clave, el resto de la app sigue funcionando |
| **Crear el perfil en `/onboarding`** ([ADR 0024](../adr/0024-perfil-en-onboarding.md)) | Trigger en `auth.users`; insertarlo en `signUp` | Registro corto y sin cuentas huérfanas por username repetido. Costo: una cuenta puede existir sin perfil y el proxy hace una consulta por navegación. Si se migra a un trigger, el ADR 0007 lo marca como motivo para revisar |
| **`INSERT` con re-consulta ante `23505`** | `upsert`; chequeo previo del username | No pisa perfiles existentes; el índice único es la fuente de verdad |
| **La puerta de onboarding falla abierta** | Bloquear ante un error de la consulta | Ante una caída parcial de la base se deja pasar en vez de bloquear a todos; las escrituras sin perfil fallarían por FK |
| **La puerta se decide con `onboarded_at`, no con la existencia del perfil** ([ADR 0025](../adr/0025-intereses-en-onboarding.md)) | Estado del paso en la URL o en una cookie | El estado sobrevive a cambiar de dispositivo y el proxy lo conoce sin consulta extra. Costo: `0010` debe aplicarse antes del despliegue |
| **`proxy.ts` con lista de prefijos** ([ADR 0003](../adr/0003-seguridad-rls-y-proxy-minimo.md)) | Verificar sesión en cada layout; roles en el proxy | Es UX, no seguridad: la seguridad real es RLS. Costo: cada ruta privada nueva debe agregarse a la lista o guardarse sola |
| **Un solo tipo de usuario** ([ADR 0002](../adr/0002-un-solo-tipo-de-usuario.md)) | Roles autor/lector | Sin flujos de conversión |
| **El registro revela si un email o un username ya existen** ("Ya existe una cuenta con este email.") | Mensaje genérico | Mejor experiencia, pero permite comprobar si un email está registrado. Motivo de elegirlo: no registrado † |

## Criterios de aceptación

- [ ] Registro válido: cuenta creada y redirección a `/onboarding`; al completar el paso 1, fila en `profiles` y el paso 2; al completar el paso 2 (mínimo 3 temas), `onboarded_at` guardado, filas en `user_interests` y redirección a `/`.
- [ ] Un username repetido se rechaza en `/onboarding` con un mensaje amable; un doble envío no muestra error.
- [ ] Un usuario con sesión que no terminó el onboarding (sin perfil, o con perfil sin `onboarded_at`) es llevado a `/onboarding` desde cualquier página de `GET`; con el onboarding terminado, `/onboarding` lo lleva a `/`.
- [ ] `saveInterests` rechaza una selección con menos temas que el mínimo o con tags que el servidor no ofrece, y no permite terminar el paso dos veces (con `onboarded_at` ya guardado redirige a `/`).
- [ ] Login con email y con username (minúsculas o mayúsculas) funciona.
- [ ] Contraseña incorrecta, usuario inexistente y email inexistente dan el mismo mensaje.
- [ ] Un cliente con clave `anon` o `authenticated` **no** puede ejecutar `login_email_for_username`.
- [ ] `/settings`, `/editor/...`, `/posts` y `/onboarding` redirigen a `/login` sin sesión; `/profile` y `/activity` también, por su cuenta.
- [ ] Un usuario no puede modificar el perfil de otro (RLS).
- [ ] `SUPABASE_SECRET_KEY` nunca aparece en el código que llega al navegador.

## Cómo verificarla a mano

1. Sin sesión, abrir `/settings`, `/posts` y `/editor/00000000-0000-0000-0000-000000000000`: redirigen a `/login`.
2. Registrar un usuario (termina en `/onboarding`), completar nombre y username y comprobar en Supabase (Table editor → `profiles`) que existe la fila con su `username` en minúsculas y `onboarded_at` en `null`. Elegir 3 temas en el paso 2 y comprobar que `onboarded_at` tiene fecha y que `user_interests` tiene tres filas de ese usuario.
3. Iniciar sesión con email; cerrar sesión; iniciar con el username en mayúsculas.
4. Iniciar con un username inventado y con una contraseña mala: mismo mensaje. Opcional: medir ambos tiempos en la pestaña *Network* de F12.
5. En el SQL Editor de Supabase, probar `select public.login_email_for_username('algo')` con el rol `authenticated` (por ejemplo desde un test con la clave publishable): debe fallar por permisos.
6. Quitar temporalmente `SUPABASE_SECRET_KEY` de `.env.local`, reiniciar: el login por email funciona; el login por username dice "No pudimos iniciar sesión.".
7. `pnpm vitest run src/features/auth` y, con la base configurada, `pnpm test:e2e -g "route protection|auth flows"`.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Escribir pruebas unitarias para `signIn` (con el cliente de Supabase simulado): email, username existente, username inexistente, error de la búsqueda. Hoy solo hay tests de schemas y e2e | A |
| Agregar un test de `PROTECTED_PATHS` (qué rutas redirige y cuáles no) y decidir si `startsWith` debe respetar el límite de segmento | M |
| Documentar que la app no implementa un límite propio de intentos de login (lo que aplique Supabase Auth no se verificó) y proponer qué haría falta | M |
| Documentar qué pasaría si se migra la creación del perfil a un trigger de base (impacto en `signUp`, en `completeOnboarding` y en el ADR 0007) | A |
| Verificar si el proyecto de Supabase exige confirmación de email (rompería el paso de `signUp` a `/onboarding`) y dejarlo escrito | M |
| `lib/supabase/client.ts` no lo importa nadie (verificado con `rg "supabase/client"`): decidir si se elimina o se conserva para uso futuro y dejarlo escrito | B |

## Preguntas de autoevaluación

1. ¿Por qué el perfil se crea en `/onboarding` con un `insert` y no con un `upsert` o un trigger?
2. (Onboarding) ¿Por qué el estado del paso se deriva de `profiles.onboarded_at` y no de la URL, y por qué `saveInterests` recalcula los tags elegibles en el servidor?
3. ¿Qué información revelaría un mensaje distinto para "usuario no existe" y por qué el código llama a Auth igualmente con `unknown-user@example.invalid`?
4. ¿Por qué `login_email_for_username` solo puede ejecutarla `service_role` y qué pasaría si la ejecutara `anon`?
5. ¿Qué es la secret key, qué salta y qué impide que llegue al navegador (`server-only`)?
6. ¿Qué hace el proxy además de redirigir a `/login`? ¿Qué costo tiene la puerta de onboarding? ¿Por qué no protege `/profile`?
7. ¿Por qué el proxy "es UX, no seguridad"? ¿Dónde está la seguridad real?
8. ¿Qué pasa si `completeOnboarding` recibe un `23505`, y por qué se vuelve a consultar el perfil en vez de mirar el nombre de la restricción?
