# PRD-1.1 — Formularios de registro y login

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-1 — Autenticación](PRD-1-auth.md) |
| Dificultad | B (básica) |
| Esfuerzo | M (2 puntos, 2 a 3 días) |
| Dueño sugerido | D7 |
| Mentor | D3 |
| Depende de | [PRD-0.2](PRD-0.2-ui-primitives.md) (`Input`, `Button`, `Card`, `Drawer`), [PRD-1.2](PRD-1.2-auth-security.md) (las Server Actions `signUp` y `signIn` que estos formularios llaman) |
| Código | `src/features/auth/components/{LoginForm,RegisterForm,LoginDrawer}.tsx`, `src/features/profile/components/{OnboardingForm,OnboardingSteps}.tsx`, `src/features/interests/components/{InterestsForm,InterestsLoadError}.tsx`, `src/features/auth/schemas.ts`, `src/features/auth/utils.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/app/(auth)/onboarding/page.tsx` |
| ADRs | [0007](../adr/0007-login-por-username-con-secret-key.md), [0025](../adr/0025-intereses-en-onboarding.md) |

## Resumen

Las pantallas por las que una persona entra a la app: crear cuenta (nombre, usuario, email, contraseña) e iniciar sesión (con **email o usuario**). Este paquete cubre lo que se ve y las reglas que validan lo escrito en los campos. Lo que ocurre **después** de pulsar el botón (crear el usuario, comprobar la contraseña) es del paquete [PRD-1.2](PRD-1.2-auth-security.md).

## Qué necesitás entender antes

- [ ] Qué es un **formulario HTML** (`<form>`, `<input name="...">`) y cómo viaja su contenido (`FormData`).
- [ ] Qué es una **Server Action**: una función que corre en el servidor y se invoca desde un formulario. Ver el [glosario](../README.md#glosario).
- [ ] Qué hace **`useActionState`** de React: guarda lo que devuelve la acción (por ejemplo `{ error }`) y dice si está "pendiente".
- [ ] Qué es **Zod**: una librería que describe cómo debe ser un dato y lo valida (`safeParse`).
- [ ] Idea de **grupo de rutas** `(auth)`: no aparece en la URL.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `LoginForm`, `RegisterForm`, `OnboardingForm`, `InterestsForm`, `OnboardingSteps` y sus páginas `/login`, `/register` y `/onboarding` | Crear el usuario y el perfil en la base, resolver username a email, cerrar sesión: [PRD-1.2](PRD-1.2-auth-security.md) |
| `LoginDrawer` (login en un cajón desde la cabecera) | La cabecera que lo aloja (`HeaderAccount`): [PRD-0.3](PRD-0.3-app-shell.md) |
| Schemas `registerSchema`, `loginSchema` y funciones `isEmailIdentifier`, `resolveAuthRedirect` | `usernameSchema` (vive en `features/profile/schemas.ts`, ver [PRD-1.3](PRD-1.3-profile-settings.md)) |
| Mensajes de error que ve el usuario | Recuperar contraseña (no existe) |

## Cómo funciona

Orden de lectura:

**1. `schemas.ts`.** Dos schemas de Zod. El de onboarding (`onboardingSchema`: `displayName` recortado y no vacío, `username` con `usernameSchema`) vive en `features/profile/schemas.ts`.

| Schema | Campos y reglas |
| :--- | :--- |
| `registerSchema` | `email` válido; `password` fuerte (8 o más caracteres, minúscula, mayúscula, número y símbolo; máximo 72 bytes), validada con las reglas de `password-rules.ts`, con un mensaje por regla incumplida; `confirmPassword`, que debe ser igual (si no: "Las contraseñas no coinciden.", con el error en `confirmPassword`) |
| `loginSchema` | `identifier` (recortado, entre 1 y 254 caracteres; puede ser email o usuario); `password` (no vacía). Es laxo a propósito: no aplica las reglas de fortaleza para no bloquear cuentas con contraseñas anteriores |

Los mensajes de error están escritos en español dentro del propio schema.

**2. `utils.ts`.**

- `isEmailIdentifier(identifier)`: devuelve `true` si el texto contiene `@`. Funciona porque un username no puede contener `@` (lo impide `usernameSchema`), así que nunca hay ambigüedad.
- `resolveAuthRedirect(raw)`: decide a dónde ir después de iniciar sesión. Acepta solo rutas internas que empiezan con `/`; rechaza `//algo` (un enlace que saldría del sitio, llamado *open redirect*), cualquier valor con `\` (los navegadores lo leen como `/`) y las rutas que empiecen con `/login`, `/register` o `/onboarding`. En cualquier otro caso devuelve `/`.

**3. `LoginForm.tsx`** (Client Component).

- `useActionState(signIn, undefined)` devuelve `[state, action, pending]`. El `<form action={action}>` envía los datos a `signIn`.
- Campos: "Email o usuario" (`name="identifier"`, `autoComplete="username"`, `autoCapitalize="none"`) y "Contraseña".
- Si recibe `redirectTo`, lo manda en un `<input type="hidden">`; `signIn` lo pasa por `resolveAuthRedirect`.
- Si `state.error` existe, se muestra debajo. Mientras `pending`, el botón queda deshabilitado y muestra un `Loader2` girando.
- Prop `inDrawer`: cuando está dentro del cajón, el pie usa `DrawerFooter` y no muestra el enlace "Registrate" (el cajón ya tiene el suyo).

**4. `RegisterForm.tsx`.** Igual estructura con `useActionState(signUp, undefined)`. Campos: email (`autoComplete="email"`), contraseña y confirmar contraseña (`PasswordField`: controlados, `autoComplete="new-password"` y botón para mostrar/ocultar). `PasswordStrength` muestra una barra de fuerza y la lista de requisitos, y el formulario avisa en vivo si las contraseñas no coinciden. "Crear cuenta" queda deshabilitado hasta que se cumplan todas las reglas y coincidan; el servidor sigue siendo la autoridad. Al terminar, `signUp` redirige a `/onboarding`. El error del formulario se anuncia con `role="alert"`.

**4b. `OnboardingForm.tsx`** (en `features/profile/`, con `useActionState(completeOnboarding, undefined)`). Campos: nombre para mostrar y nombre de usuario (con `minLength`, `maxLength`, `pattern="[A-Za-z0-9_]+"`, un texto de ayuda y `autoComplete="off"` para que los gestores de contraseñas no lo llenen con el email). Botón "Continuar". Es el paso 1 del onboarding. La página `/onboarding` agrega un botón "Cerrar sesión" para quien no lo completó, y redirige a `/login` sin sesión y a `/` si el onboarding ya terminó.

**4c. `InterestsForm.tsx`** (en `features/interests/`, con `useActionState(saveInterests, undefined)`). Es el paso 2: chips (`button` con `aria-pressed`, mínimo 44 px de alto) con los temas que ofrece el servidor, seleccionables hasta un máximo de 20 (los demás se deshabilitan). Solo el grupo de chips hace scroll (`max-h-[50svh]`); el contador y el botón "Continuar" quedan a la vista. El contador (`interestCounterLabel`, en una región `role="status"`) dice "Elegí al menos 3 · 1 elegido" mientras falta y "N elegidos" después. "Continuar" queda deshabilitado hasta llegar al mínimo (`requiredInterestCount`: 3, o menos si hay menos temas; con ninguno se muestra "Todavía no hay temas para elegir. Podés seguir sin elegir ninguno."). Si la lista no cargó, la página muestra `InterestsLoadError` con reintento en lugar del formulario. Al retomar, los temas ya guardados vienen preseleccionados.

**4d. `OnboardingSteps.tsx`.** Indicador de dos pasos ("Tu perfil", "Tus intereses") con dos barras y el texto "Paso N de 2"; para lectores de pantalla, una lista `ol` con `aria-current="step"`. Respeta `prefers-reduced-motion`.

> El `pattern` del navegador permite mayúsculas, pero `usernameSchema` las pasa a minúsculas en el servidor. Las validaciones del navegador son solo una ayuda; **la validación real es la de Zod en el servidor**.

**5. `LoginDrawer.tsx`.** Es el botón "Iniciar sesión" de la cabecera cuando no hay sesión. Abre un cajón (`Drawer`) con el `LoginForm` y un bloque de "beneficios" (editor con IA, notas breves, lecturas y seguimiento). Le pasa `redirectTo={pathname}` (la ruta actual) para volver a la misma página después de entrar. Se puede usar controlado (`open`/`onOpenChange`) o no.

**6. Páginas `(auth)/login/page.tsx`, `register/page.tsx` y `onboarding/page.tsx`.** Una `Card` de `max-w-sm` centrada con el formulario (en `/onboarding` la `Card` pasa a `max-w-lg` en el paso 2, por los chips). El grupo `(auth)` **no tiene layout propio**: no hay cabecera ni navegación, solo el layout raíz.

### Mensajes de error que ve el usuario

| Situación | Mensaje |
| :--- | :--- |
| Dato inválido | El primer mensaje del schema (por ejemplo "La contraseña debe tener al menos 8 caracteres." o "La contraseña debe incluir un símbolo.") |
| Contraseñas distintas al registrarse | "Las contraseñas no coinciden." |
| Usuario ya usado (en `/onboarding`) | "Ese nombre de usuario ya está en uso." |
| Email ya registrado | "Ya existe una cuenta con este email." |
| Cualquier otro fallo al crear | "No pudimos crear tu cuenta. Intentá de nuevo." |
| Falla el guardado del perfil en `/onboarding` | "No pudimos guardar tu perfil. Intentá de nuevo." |
| Contraseña incorrecta, usuario o email inexistentes | "Credenciales inválidas." (siempre el mismo) |
| Falla la búsqueda del usuario en el servidor | "No pudimos iniciar sesión. Intentá de nuevo." |

## Decisiones y por qué

| Decisión | Alternativas | Consecuencia |
| :--- | :--- | :--- |
| **Un solo campo "Email o usuario"** ([ADR 0007](../adr/0007-login-por-username-con-secret-key.md)) | Dos campos o dos pantallas | Se distingue por la presencia de `@`. Costo: un username no puede contener `@` |
| **Mismo mensaje para todo fallo de credenciales** | Mensajes distintos por caso | No permite saber si un usuario existe (ver [PRD-1.2](PRD-1.2-auth-security.md)) |
| **`useActionState` + Server Action** en lugar de `fetch` desde el navegador | API propia | Menos código en el cliente y validación única en el servidor. Motivo exacto no registrado † |
| **Login también en un cajón de la cabecera** | Solo la página `/login` | No se pierde la página actual: vuelve a ella. Por qué se agregó no está registrado † |
| **`resolveAuthRedirect` valida la ruta de retorno** | Redirigir a lo que llegue | Evita *open redirect* (mandar al usuario a un sitio ajeno tras el login). Tiene tests |

## Criterios de aceptación

- [ ] `/register` muestra tres campos (email, contraseña, confirmar contraseña) y "Crear cuenta". Con una contraseña que no cumple las reglas o que no coincide, el botón queda deshabilitado. Un registro válido termina en `/onboarding`, que pide en el paso 1 nombre y usuario y en el paso 2 al menos 3 temas, y termina en `/`.
- [ ] `/login` acepta email **o** usuario (sin distinguir mayúsculas en el usuario).
- [ ] Un dato inválido muestra el mensaje en español debajo de los campos, sin recargar toda la página.
- [ ] Mientras se envía, el botón está deshabilitado y muestra el indicador de carga.
- [ ] Contraseña incorrecta, usuario inexistente y email inexistente muestran exactamente el mismo mensaje.
- [ ] Desde el cajón de la cabecera, iniciar sesión vuelve a la misma página.
- [ ] En el paso 2, "Continuar" está deshabilitado hasta elegir 3 temas, el contador refleja la selección y no se pueden elegir más de 20.
- [ ] `resolveAuthRedirect` rechaza `//evil.com`, `https://evil.com`, `/\evil.com`, `/login`, `/register` y `/onboarding`.

## Cómo verificarla a mano

1. `pnpm dev` y abrir `/register`. Escribir una contraseña de 3 caracteres: la lista de requisitos marca lo que falta, la barra queda en "Débil" y "Crear cuenta" sigue deshabilitado. Escribir una confirmación distinta: aparece "Las contraseñas no coinciden." al instante. El mensaje de Zod solo se ve si el dato llega al servidor.
2. Registrar un usuario nuevo con datos válidos: termina en `/onboarding`; completar nombre y usuario, elegir 3 temas en el paso 2 (hace falta que haya artículos publicados con tags; si no, el mínimo se relaja) y llegar a `/` con sesión iniciada.
3. Cerrar sesión desde el menú de cuenta. En `/login`, entrar con el **email**; salir; entrar con el **usuario en mayúsculas**.
4. Entrar con una contraseña incorrecta y con un usuario inventado: el mensaje debe ser el mismo.
5. Sin sesión, en `/` pulsar "Iniciar sesión" (cajón), iniciar sesión y comprobar que se vuelve a `/`.
6. Tests: `pnpm vitest run src/features/auth/schemas.test.ts` (cubre `registerSchema`, `loginSchema`, `isEmailIdentifier`, `resolveAuthRedirect`; `onboardingSchema` está en `src/features/profile/schemas.test.ts` y la selección de intereses en `src/features/interests/`).
7. Extra: `pnpm test:e2e -g "auth flows"` necesita la base de datos configurada y registra usuarios reales; consultar antes con el mentor. Ver además la advertencia en [PRD-X.1](PRD-X.1-testing-e2e.md).

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| `LoginDrawer` promete "Guardá tus artículos favoritos para leer después", pero no existe ninguna función de guardado (la ruta `/saved` da 404). Corregir el texto para que no prometa algo inexistente | B |
| Hacer que el `pattern` de `OnboardingForm`/`SettingsForm` (`[A-Za-z0-9_]+`) sea coherente con la regla real (minúsculas), o agregar una nota que explique la diferencia | B |
| El botón "Registrarse" de la cabecera se oculta por debajo de 640 px (`hidden sm:inline-flex`); en móvil chico solo se llega al registro desde el cajón. Evaluar si es intencional y dejarlo registrado | B |
| No existe "Olvidé mi contraseña". Redactar (solo documento) qué haría falta | M |
| El registro dice "Ya existe una cuenta con este email.": eso confirma que un email está registrado. Documentar el equilibrio entre comodidad y privacidad y proponer una alternativa | M |

## Preguntas de autoevaluación

1. ¿Qué pasa exactamente al pulsar "Crear cuenta"? ¿En qué archivo empieza el viaje de los datos y en cuál se valida?
2. ¿Por qué la validación de Zod del servidor es necesaria aunque el formulario ya deshabilite el botón según las reglas y el navegador tenga `pattern`?
3. ¿Cómo distingue `isEmailIdentifier` un email de un usuario y por qué eso es seguro?
4. ¿Qué es un *open redirect* y cómo lo evita `resolveAuthRedirect`?
5. ¿Para qué sirve el campo oculto `redirectTo` y quién lo llena?
6. ¿Por qué los errores de login son siempre "Credenciales inválidas."? (pista: [PRD-1.2](PRD-1.2-auth-security.md))
