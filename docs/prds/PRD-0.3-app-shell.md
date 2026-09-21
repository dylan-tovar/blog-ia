# PRD-0.3 — Shell de la aplicación (cabecera, navegación y menú de cuenta)

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-0 — Sistema de diseño](PRD-0-design-system.md) |
| Dificultad | M (media) |
| Esfuerzo | M (2 puntos, 2 a 3 días) |
| Dueño sugerido | D6 |
| Mentor | D2 |
| Depende de | [PRD-0.1](PRD-0.1-theme-tokens.md), [PRD-0.2](PRD-0.2-ui-primitives.md) |
| Código | `src/components/shared/` (`AppShell`, `MainNav`, `BottomNav`, `HeaderTitle`, `HeaderAccount`, `AccountDrawer`, `UserAvatar`, `navigation.ts`), `src/lib/viewer.ts`, `src/app/(public)/layout.tsx`, `src/app/(dashboard)/layout.tsx` |
| ADRs | [0006](../adr/0006-organizacion-por-dominio.md), [0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md) |

## Resumen

El "marco" que rodea a casi todas las pantallas: la barra superior fija (logo, título de la página, avatar o botones de sesión), la barra inferior con cuatro destinos en móvil, y el menú de cuenta que se abre con el avatar. Es lo primero que ve cualquier usuario, así que un error aquí se nota en toda la app.

## Qué necesitás entender antes

- [ ] Qué es un **layout** en Next.js (un componente que envuelve a varias páginas) y qué es un **grupo de rutas** como `(public)`: los paréntesis no forman parte de la URL.
- [ ] Diferencia entre **Server Component** (corre en el servidor, puede pedir datos) y **Client Component** (`"use client"`, tiene estado e interactividad).
- [ ] Qué es `usePathname()` (la ruta actual, solo disponible en Client Components).
- [ ] Idea de **`<Suspense>`**: mostrar algo ya y completar el resto cuando llegue.
- Los términos nuevos están en el [glosario](../README.md#glosario).

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| `AppShell`: cabecera y `main` de una sola columna | Botón "+" y diálogo de notas: [PRD-7.2](PRD-7.2-notes-ui.md) (el shell solo lo recibe como `fab`) |
| Navegación (`NAV_ITEMS`), barra inferior y iconos de escritorio | Contenido de `/explore` y `/activity`: [PRD-9.1](PRD-9.1-explore-page.md) y [PRD-9.2](PRD-9.2-activity-nav.md) (este paquete solo dibuja los destinos) |
| Título de la cabecera según la ruta | Formularios de login: [PRD-1.1](PRD-1.1-auth-forms.md) |
| Menú de cuenta y `UserAvatar` | Autenticación real (`signOut`): [PRD-1.2](PRD-1.2-auth-security.md) |

## Cómo funciona

Orden de lectura:

**1. `navigation.ts` (33 líneas, sin React).** Es el "mapa" de la navegación y la parte con tests.

- `NAV_ITEMS`: cuatro destinos, en este orden: Inicio `/`, Explorar `/explore`, Actividad `/activity`, Perfil `/profile`.
- `getPageTitle(pathname)`: toma el primer segmento de la ruta (`/posts/abc` → `posts`) y busca su título: `posts` → "Mis posts", `explore` → "Explorar", `activity` → "Actividad", `settings` → "Settings", `profile` → "Perfil", `post` → "Post", `author` → "Autor". Si no lo encuentra devuelve "Inicio".
- `isNavItemActive(pathname, href)`: decide qué icono se ve activo. `/` solo es activo en la raíz exacta; Perfil también es activo en `/author/...`; el resto por igualdad o prefijo (`/postscript` no cuenta como `/posts`).

**2. `AppShell.tsx`.**

- Dibuja el `<header>` fijo (`sticky top-0`): logo que enlaza a `/`, `HeaderTitle` y a la derecha `HeaderAccount`.
- El `<main>` es una columna centrada (`max-w-2xl`) **en todos los tamaños**; no hay diseño de dos columnas.
- Con sesión, agrega el botón "+" y la barra inferior. Esa parte está dentro de `<Suspense>` para que el shell aparezca de inmediato sin esperar la consulta de sesión.
- Recibe `fab` como **función** (`fab(viewer)`) y no un componente importado: así `components/shared/` no importa nada de `features/`. Los layouts `(public)/layout.tsx` y `(dashboard)/layout.tsx` le pasan `NewPostButton`.

**3. `src/lib/viewer.ts`.** `getViewer()` devuelve `{ id, displayName, username }` del usuario con sesión, o `null`. Está envuelto en `cache` de React: la cabecera, la barra inferior y la página comparten **una sola consulta** por petición.

**4. Piezas de navegación.**

| Archivo | Cuándo aparece | Detalle |
| :--- | :--- | :--- |
| `BottomNav.tsx` | Solo con sesión y por debajo de `md` (`md:hidden`) | Los cuatro destinos con iconos (`House`, `Search`, `Bell`, `User`); marca `aria-current="page"` en el activo |
| `MainNav.tsx` | Solo con sesión y desde `md` | Tres iconos (sin Perfil: el avatar ya lleva allí) |
| `HeaderTitle.tsx` | Siempre | Muestra `getPageTitle(pathname)` |
| `HeaderAccount.tsx` | Siempre | Con sesión: `MainNav` + `AccountDrawer`. Sin sesión: `LoginDrawer` (botón "Iniciar sesión") y un botón "Registrarse" que solo se ve desde el ancho `sm` (640 px) |

**5. `AccountDrawer.tsx`.** Menú que se abre al tocar el avatar (`Drawer` de [PRD-0.2](PRD-0.2-ui-primitives.md)): encabezado con nombre y `@username` (enlaza a `/profile`), lista de enlaces con iconos, "Settings", "Support", "Sign out" y un pie con enlaces legales. "Sign out" llama a `signOut` con `useTransition` y muestra un `Loader2` mientras espera.

**6. `UserAvatar.tsx`.** Envuelve el `Avatar` y muestra las **iniciales** del nombre (`getInitials` en `src/lib/format.ts`: hasta dos palabras; si no hay nombre muestra `?`). No hay foto: ver [PRD-1.3](PRD-1.3-profile-settings.md).

### Enlaces del menú de cuenta

Funcionan: `/profile`, `/` (Home), `/activity`, `/explore`, `/settings` y el cierre de sesión. **No existen** las rutas `/subscriptions`, `/saved`, `/support`, `/about`, `/privacy`, `/terms`, `/data` y `/accessibility`: comprobado, `src/app` no tiene ninguna de esas carpetas, así que cada una lleva al 404 de la app. Las etiquetas del menú están en inglés ("Home", "Subscriptions", "Saved", "Activity", "Explore", "Settings", "Support", "Sign out", "About", "Privacy", "Terms", "Data", "Accessibility") mientras el resto de la interfaz está en español.

## Decisiones y por qué

| Decisión | Alternativas | Consecuencia |
| :--- | :--- | :--- |
| **Shell mobile-first de una columna** ([ADR 0008](../adr/0008-tema-oscuro-y-shell-de-aplicacion.md)) | Diseño de dos columnas en escritorio | Un solo diseño que mantener. El PRD 0 original preveía dos columnas y no se hizo |
| **Cuatro destinos** (Inicio, Explorar, Actividad, Perfil) | Los tres originales (Inicio, Mis posts, Perfil) | "Mis posts" salió de la barra y quedó como ruta `/posts`. El ADR 0008 previó revisar la navegación cuando hubiera más destinos |
| **`fab` como función** ([ADR 0006](../adr/0006-organizacion-por-dominio.md)) | Importar `NewPostButton` dentro de `shared/` | `shared/` no depende de ninguna feature |
| **Partes con sesión dentro de `<Suspense>`** | Esperar la sesión antes de dibujar | La cabecera aparece de inmediato sin esperar la comprobación de sesión (motivo registrado en un comentario de `AppShell.tsx`) |
| **`getViewer` cacheado por petición** | Una consulta por componente | Una sola consulta compartida |
| **Perfil no está en la barra de escritorio** | Repetirlo | El avatar ya enlaza al perfil (comentario en `MainNav.tsx`) |

## Criterios de aceptación

- [ ] Con sesión y en móvil (menos de 768 px) aparece la barra inferior con cuatro destinos y el destino activo se distingue.
- [ ] Con sesión y en escritorio (768 px o más) la barra inferior desaparece y aparecen tres iconos en la cabecera.
- [ ] Sin sesión no hay barra de navegación: solo "Iniciar sesión" (y "Registrarse" desde 640 px).
- [ ] El título de la cabecera cambia con la ruta según `getPageTitle`.
- [ ] Tocar el avatar abre el menú de cuenta; "Sign out" cierra la sesión y lleva a `/login`.
- [ ] `components/shared/` no importa desde `features/` (salvo lo que hoy ya existe: `HeaderAccount` importa `LoginDrawer` y `AccountDrawer` importa `signOut`, ambos de `features/auth`).

## Cómo verificarla a mano

1. `pnpm dev`. Sin sesión, abrir `/`: solo hay "Iniciar sesión". Con la ventana de 360 px de ancho, "Registrarse" no aparece.
2. Registrar un usuario (o iniciar sesión) y volver a `/`. En 360 px: barra inferior con cuatro iconos. Pulsar Explorar: el icono activo cambia y el título de la cabecera dice "Explorar".
3. Ensanchar la ventana a más de 768 px: la barra inferior desaparece y los iconos pasan a la cabecera.
4. Tocar el avatar: se abre el menú. Pulsar "Support": lleva a un 404 (es la deuda documentada).
5. Correr el test unitario del mapa de navegación: `pnpm vitest run src/components/shared/navigation.test.ts`.
6. `pnpm lint`.

## Trabajo pendiente asignable

| Tarea | Dificultad |
| :--- | :--- |
| Traducir al español las etiquetas del menú de cuenta y el título "Settings" de `PAGE_TITLES` (y actualizar `navigation.test.ts`, que espera "Settings") | B |
| Decidir qué hacer con los enlaces a rutas inexistentes del menú de cuenta (quitarlos u ocultarlos hasta que existan) y dejarlo escrito | B |
| Agregar tests para `getViewer` sin sesión o para `HeaderTitle` (hoy solo `navigation.ts` tiene tests) | M |
| Reparar `e2e/shell.spec.ts` junto con [PRD-X.1](PRD-X.1-testing-e2e.md): sigue esperando un botón "Nuevo post", un enlace "Tu perfil" y tres destinos de navegación | M |

## Preguntas de autoevaluación

1. ¿Por qué `AppShell` recibe `fab` como función y no importa el botón directamente?
2. ¿Qué pasa si `getViewer()` se llama tres veces en una misma petición? ¿Por qué?
3. ¿Qué diferencia hay entre `BottomNav` y `MainNav` y cómo se decide cuál se ve?
4. ¿Cómo sabe el título de la cabecera en qué página está? ¿Qué ocurre con una ruta desconocida?
5. ¿Por qué el menú de cuenta tiene enlaces que llevan a 404 y cómo se arreglaría?
6. ¿Qué parte del shell se dibuja de inmediato y cuál espera la sesión?
