# PRD-1.2 — Seguridad de autenticación (acciones, proxy y username → email)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-1 — Autenticación](PRD-1-auth.md) |
| Dificultad | A (avanzada) |
| Esfuerzo | L (4 puntos, más de 3 días) |
| Dueño sugerido | D1 |
| Mentor | — |
| Depende de | Supabase Auth y RLS de `profiles` (migración `0001`) |
| Código | `src/features/auth/actions.ts`, `src/features/auth/queries.ts`, `src/proxy.ts`, `src/lib/auth.ts`, `src/lib/viewer.ts`, `src/lib/supabase/{server,client,admin}.ts`, `src/lib/env.ts`, `src/lib/env.server.ts`, `supabase/migrations/0001_profiles.sql`, `supabase/migrations/0004_username.sql` |
| ADRs | [0002](../adr/0002-un-solo-tipo-de-usuario.md), [0003](../adr/0003-seguridad-rls-y-proxy-minimo.md), [0007](../adr/0007-login-por-username-con-secret-key.md) |

## Resumen

La parte del sistema donde una equivocación es un problema de seguridad: cómo se crea una cuenta sin dejar datos a medias, cómo se inicia sesión con **email o username** sin revelar qué usuarios existen ni exponer emails, cómo se refresca la sesión y qué rutas quedan protegidas. Toda la seguridad **de datos** la hace RLS en la base; el `proxy.ts` solo redirige (es UX, no seguridad).

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
| `signUp`, `signIn`, `signOut` | Aspecto y validación de campos del formulario: [PRD-1.1](PRD-1.1-auth-forms.md) |
| `findEmailByUsername` y la función SQL `login_email_for_username` | Edición de perfil: [PRD-1.3](PRD-1.3-profile-settings.md) |
| `proxy.ts`: refresco de sesión y rutas protegidas | Rate limit de la IA (usa también la secret key): [PRD-5.2](PRD-5.2-rate-limit.md) |
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

### 2. `signUp` (`features/auth/actions.ts`)

```text
1. registerSchema.safeParse(formData)          -> si falla, { error } con el primer mensaje
2. isUsernameAvailable(username)?               -> si no, "Ese nombre de usuario ya está en uso."
3. supabase.auth.signUp({ email, password })   -> user_already_exists = "Ya existe una cuenta con este email."
4. createProfile(...)  insert en profiles, con UN reintento
5. redirect("/")                               -> aunque el perfil falle: se completa en /settings
```

- **El orden importa:** el username se comprueba **antes** de crear el usuario en Auth. Si se hiciera después y fallara, quedaría una cuenta sin perfil.
- El perfil lo crea la Server Action con la sesión del propio usuario y bajo RLS (política "Users can insert their own profile"). **No hay trigger** en la base.
- Carrera conocida: entre `isUsernameAvailable` y el `insert` otro usuario puede tomar el mismo username. Lo detiene el índice único `profiles_username_key`; el registro no se bloquea y la persona completa su perfil en `/settings` (`updateProfile` usa `upsert`).

### 3. `signIn`

```text
identifier = "usuario" o "email"
si contiene "@"  -> email = identifier
si no            -> email = findEmailByUsername(identifier.toLowerCase())   // RPC con secret key
                    si la búsqueda lanza -> "No pudimos iniciar sesión. Intentá de nuevo."
signInWithPassword({ email: email ?? "unknown-user@example.invalid", password })
si hay error -> "Credenciales inválidas."          // siempre el mismo
si no        -> redirect(resolveAuthRedirect(redirectTo))
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
- Si la ruta empieza con `/settings`, `/editor` o `/posts` y no hay usuario, redirige a `/login`. Usa `startsWith`, sin comprobar el límite de segmento (una ruta como `/postscript` también contaría).
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
| **Crear el perfil desde la Server Action** | Trigger en `auth.users` | Menos magia en la base †; a cambio hay reintento y el "completar en /settings". Si se migra a un trigger, el ADR 0007 lo marca como motivo para revisar |
| **Comprobar el username antes de `signUp`** | Insertar el perfil y capturar el conflicto | Evita cuentas huérfanas. Descartar la alternativa por sus conflictos es † |
| **`proxy.ts` con lista de prefijos** ([ADR 0003](../adr/0003-seguridad-rls-y-proxy-minimo.md)) | Verificar sesión en cada layout; roles en el proxy | Es UX, no seguridad: la seguridad real es RLS. Costo: cada ruta privada nueva debe agregarse a la lista o guardarse sola |
| **Un solo tipo de usuario** ([ADR 0002](../adr/0002-un-solo-tipo-de-usuario.md)) | Roles autor/lector | Sin flujos de conversión |
| **El registro revela si un email o un username ya existen** ("Ya existe una cuenta con este email.") | Mensaje genérico | Mejor experiencia, pero permite comprobar si un email está registrado. Motivo de elegirlo: no registrado † |

## Criterios de aceptación

- [ ] Registro válido: cuenta creada, fila en `profiles`, redirección a `/`.
- [ ] Un username repetido se rechaza **antes** de crear el usuario en Auth.
- [ ] Si el `insert` en `profiles` falla dos veces, el registro no se bloquea.
- [ ] Login con email y con username (minúsculas o mayúsculas) funciona.
- [ ] Contraseña incorrecta, usuario inexistente y email inexistente dan el mismo mensaje.
- [ ] Un cliente con clave `anon` o `authenticated` **no** puede ejecutar `login_email_for_username`.
- [ ] `/settings`, `/editor/...` y `/posts` redirigen a `/login` sin sesión; `/profile` y `/activity` también, por su cuenta.
- [ ] Un usuario no puede modificar el perfil de otro (RLS).
- [ ] `SUPABASE_SECRET_KEY` nunca aparece en el código que llega al navegador.

## Cómo verificarla a mano

1. Sin sesión, abrir `/settings`, `/posts` y `/editor/00000000-0000-0000-0000-000000000000`: redirigen a `/login`.
2. Registrar un usuario y comprobar en Supabase (Table editor → `profiles`) que existe la fila con su `username` en minúsculas.
3. Iniciar sesión con email; cerrar sesión; iniciar con el username en mayúsculas.
4. Iniciar con un username inventado y con una contraseña mala: mismo mensaje. Opcional: medir ambos tiempos en la pestaña *Network* de F12.
5. En el SQL Editor de Supabase, probar `select public.login_email_for_username('algo')` con el rol `authenticated` (por ejemplo desde un test con la clave publishable): debe fallar por permisos.
6. Quitar temporalmente `SUPABASE_SECRET_KEY` de `.env.local`, reiniciar: el login por email funciona; el login por username dice "No pudimos iniciar sesión.".
7. `pnpm vitest run src/features/auth/schemas.test.ts` y, con la base configurada, `pnpm test:e2e -g "route protection|auth flows"`.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Escribir pruebas unitarias para `signIn` (con el cliente de Supabase simulado): email, username existente, username inexistente, error de la búsqueda. Hoy solo hay tests de schemas y e2e | A |
| Agregar un test de `PROTECTED_PATHS` (qué rutas redirige y cuáles no) y decidir si `startsWith` debe respetar el límite de segmento | M |
| Documentar que la app no implementa un límite propio de intentos de login (lo que aplique Supabase Auth no se verificó) y proponer qué haría falta | M |
| Documentar qué pasaría si se migra la creación del perfil a un trigger de base (impacto en `signUp`, en `createProfile` y en el ADR 0007) | A |
| `lib/supabase/client.ts` no lo importa nadie (verificado con `rg "supabase/client"`): decidir si se elimina o se conserva para uso futuro y dejarlo escrito | B |

## Preguntas de autoevaluación

1. ¿Por qué `signUp` comprueba el username **antes** de crear el usuario en Auth?
2. ¿Qué información revelaría un mensaje distinto para "usuario no existe" y por qué el código llama a Auth igualmente con `unknown-user@example.invalid`?
3. ¿Por qué `login_email_for_username` solo puede ejecutarla `service_role` y qué pasaría si la ejecutara `anon`?
4. ¿Qué es la secret key, qué salta y qué impide que llegue al navegador (`server-only`)?
5. ¿Qué hace el proxy además de redirigir? ¿Por qué no protege `/profile`?
6. ¿Por qué el proxy "es UX, no seguridad"? ¿Dónde está la seguridad real?
7. ¿Qué carrera existe entre `isUsernameAvailable` y el `insert`, y qué la contiene?
