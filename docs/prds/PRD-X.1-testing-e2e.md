# PRD-X.1 — Tests: reparar los e2e y cubrir huecos unitarios

| Campo | Valor |
| :--- | :--- |
| **Padre** | [PRD-global](../PRD-global-vision.md) (paquete transversal, no pertenece a una sola feature) |
| **Dificultad** | Media (M) |
| **Esfuerzo** | M (2 a 3 días de lectura y trabajo) |
| **Dueño sugerido** | D12 |
| **Mentor** | D2 |
| **Depende de** | [PRD-1.1](PRD-1.1-auth-forms.md) (el registro que usa `register`), [PRD-0.3](PRD-0.3-app-shell.md) (barra de navegación), [PRD-2.3](PRD-2.3-autosave-drafts.md) (creación perezosa del borrador), [PRD-2.4](PRD-2.4-publish-dialog-tags.md) (diálogo de publicar), [PRD-7.2](PRD-7.2-notes-ui.md) (botón "+" y menú Crear) |
| **Código** | `e2e/` (`helpers.ts`, `auth.spec.ts`, `posts.spec.ts`, `feed.spec.ts`, `shell.spec.ts`, `editor-ai-drawer.spec.ts`), `playwright.config.ts`, `vitest.config.mts` |
| **ADRs** | [0018](../adr/0018-sin-ci-gates-manuales.md) (sin CI, gates manuales) |

## Resumen

Los tests unitarios son la red de seguridad confiable del proyecto. Los tests **end-to-end (e2e)**, que manejan un navegador real, quedaron desfasados respecto a la interfaz: varios no pueden pasar tal como están. Este paquete consiste en **entender qué prueba cada capa, reparar los e2e uno por uno y cerrar huecos de tests unitarios**. Es un buen paquete para aprender el proyecto entero porque obliga a recorrer sus pantallas.

## Qué necesitás entender antes

- [ ] La diferencia entre un test **unitario** (Vitest, función aislada, sin red) y uno **e2e** (Playwright, navegador real contra una base real).
- [ ] Qué es un *locator* de Playwright: `getByRole`, `getByLabel`, `getByText`. Buscan por lo que ve el usuario (texto y rol), no por clases CSS.
- [ ] `async/await` y por qué cada `click` y cada `expect` llevan `await`.
- [ ] Qué es un **Server Action** y un **Server Component** (glosario en [`docs/README.md`](../README.md#glosario)): los e2e prueban su resultado en pantalla, no su código.

## Alcance / fuera de alcance

| Entra | No entra |
| :--- | :--- |
| Reparar `e2e/helpers.ts` y los specs que fallan por cambios de interfaz | Cambiar código de `src/` para que los tests pasen (si el test tiene razón y la app está mal, se avisa al dueño del paquete afectado) |
| Actualizar [`guides/testing.md`](../guides/testing.md#problemas-conocidos) a medida que se cierra cada problema | Montar CI ([ADR 0018](../adr/0018-sin-ci-gates-manuales.md) decidió no tenerlo) |
| Agregar tests unitarios de lógica pura sin cobertura | Tests de componentes React (el entorno de Vitest es `node`, sin DOM) |
| | El desfase de email entre `verify-post-writes.mjs` y el seed: es la tarea T1 de [PRD-X.2](PRD-X.2-dev-tooling.md) |

## Cómo funciona

Orden recomendado para leer:

1. `playwright.config.ts`: un proyecto `chromium`, `baseURL` `http://localhost:3000`, y arranca `pnpm dev` solo (o reutiliza el que ya corre). Sin reintentos en local.
2. `e2e/helpers.ts`: `register(page)` llena `/register` (email, contraseña y confirmación), completa `/onboarding` (paso 1: nombre y username únicos; paso 2: elige hasta 3 temas) y espera el feed; `createDraft(page)` debería dejarte dentro del editor con un borrador.
3. `e2e/posts.spec.ts` y `e2e/feed.spec.ts`: crean un borrador, lo publican y comprueban el feed.
4. `e2e/shell.spec.ts`: barra superior, barra inferior y botón "+".
5. `e2e/editor-ai-drawer.spec.ts`: el más largo. **Intercepta** `POST /api/ai/chat` y responde NDJSON armado a mano, así que no llama a Gemini. Todos sus tests arrancan con `createDraft` en un `beforeEach`, por eso el desfase de ese helper los rompe a todos.
6. `vitest.config.mts`: entorno `node`, incluye `src/**/*.test.ts`. El detalle por área está en [`guides/testing.md`](../guides/testing.md).

### Qué está desfasado (verificado leyendo `e2e/` contra `src/`)

| # | Test o helper | Qué espera | Qué hay hoy |
| :--- | :--- | :--- | :--- |
| 1 | `createDraft` (`helpers.ts`) | En `/posts`, un botón "Nuevo post" que lleva a `/editor/<uuid>` | Ese botón no existe. El artículo se crea entrando a `/editor/new` (enlace "Artículo" del menú Crear) y la fila **no existe hasta el primer autoguardado con contenido**: entonces `use-autosave.ts` cambia la URL con `history.replaceState` a `/editor/<id>` |
| 2 | `shell.spec.ts`, "the + button creates a draft…" y la aserción de anónimo | Un botón "Nuevo post" | El botón "+" se llama "Nueva nota" en móvil y "Crear" en escritorio (`NewPostButton.tsx`). La aserción de anónimo (`toHaveCount(0)`) pasa hoy **de forma vacía**: busca un botón que ya no existe y no comprueba nada |
| 3 | `shell.spec.ts`, barra inferior "three destinations" | Inicio, Mis posts, Perfil | Son cuatro: Inicio, Explorar, Actividad, Perfil (`navigation.ts`) |
| 4 | `shell.spec.ts` y `feed.spec.ts` | Un enlace o texto "Tu perfil" | No existe en `src/`. La cuenta se abre con el botón "Menú de cuenta" (`AccountDrawer`). Además `getPageTitle("/settings")` devuelve "Settings", no "Tu perfil" |
| 5 | `posts.spec.ts` y `feed.spec.ts` | Pulsar "Publicar" directamente | Primero se pulsa "Continuar" (`EditorTopBar`), que abre el diálogo; ahí está "Publicar" (`PublishDialog`). Además el test del post vacío busca el texto "El post no puede estar vacío para publicarlo." y hoy el mensaje es "El artículo no puede estar vacío para publicarlo." (`PublishDialog.tsx`, `actions.ts`). Una vez publicado, el botón de la barra pasa a decir "Tags" |
| 6 | `uniqueEmail()` (`helpers.ts`) | `…@example.com` sirve para registrarse | El propio `seed-dev.mjs` documenta que el registro público de Supabase rechaza dominios sin MX (por eso el seed crea las cuentas con el Admin API) |

Lo que **sí** sigue vigente: `getByLabel("Título")` (`PostEditor.tsx`), `getByLabel("Contenido")` (coincide por subcadena con el `aria-label` "Contenido del artículo" de `use-article-editor.ts`), `getByPlaceholder("Agregar tag")` y el texto "Guardado".

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| Mantener e2e reales contra Supabase y no mocks de la base | Es lo que valida RLS y los flujos completos; el costo es que cada corrida crea usuarios reales (ver [`testing.md`](../guides/testing.md#tests-end-to-end-playwright)) |
| El cajón de IA se prueba con el stream simulado | No gasta cuota de Gemini ni depende de la red |
| Sin CI ([ADR 0018](../adr/0018-sin-ci-gates-manuales.md)) | Los gates se corren a mano; por eso un test roto puede pasar desapercibido mucho tiempo: es exactamente lo que ocurrió |
| Los locators buscan por texto visible en español | Reflejan lo que ve el usuario, pero cambiar un texto de la interfaz rompe el test † |

## Criterios de aceptación

- [ ] `createDraft` devuelve el id del borrador con el flujo real (entrar a `/editor/new`, escribir, esperar "Guardado" y la URL `/editor/<uuid>`).
- [ ] `pnpm test:e2e` corre sin fallos por selectores obsoletos (los problemas 1 a 5 de la tabla resueltos).
- [ ] `register` funciona con un dominio aceptado por Supabase (problema 6), sin dejar la `SUPABASE_SECRET_KEY` en el código ni en el repositorio.
- [ ] `editor-ai-drawer.spec.ts` llega más allá de su `beforeEach`.
- [ ] La tabla "Problemas conocidos" de [`guides/testing.md`](../guides/testing.md#problemas-conocidos) refleja lo que quedó abierto.

## Cómo verificarla a mano

1. `pnpm install`, configurar `.env.local` y tener las migraciones `0001` a `0007` aplicadas en un proyecto de **desarrollo** ([getting-started](../guides/getting-started.md)).
2. `pnpm exec playwright install chromium` (una sola vez).
3. `pnpm test`: los unitarios deben pasar sin red.
4. `pnpm test:e2e e2e/shell.spec.ts` para probar de a un archivo; después el resto. Con `pnpm exec playwright test --ui` se ve el navegador paso a paso.
5. Antes de dar por cerrado un problema, correr el spec que lo tocaba **dos veces** (los datos son únicos por corrida, pero la carrera de autoguardado puede mostrar fallos intermitentes).

## Trabajo pendiente asignable

| # | Tarea | Dif. |
| :--- | :--- | :--- |
| T1 | Reparar `createDraft` según la fila 1 y comprobar que `editor-ai-drawer.spec.ts` deja de fallar en el `beforeEach` | M |
| T2 | Actualizar `shell.spec.ts`: cuatro destinos en la barra inferior, nombre del botón "+", el menú de cuenta en lugar de "Tu perfil" y el título "Settings" (filas 2 a 4) | B |
| T3 | Adaptar `posts.spec.ts` y `feed.spec.ts` al flujo "Continuar" → "Publicar" → "Publicado." y actualizar el texto del error del post vacío (fila 5). Averiguar con el mentor qué hace la publicación sin `GEMINI_API_KEY`: según [PRD-5](PRD-5-ai-author.md) la moderación falla abierta y publica sin tags, pero con clave consume cuota | M |
| T4 | Resolver `uniqueEmail()` (fila 6): crear las cuentas con el Admin API como hace `scripts/seed-dev.mjs` y entrar por la interfaz. No verificado: si el proyecto exige confirmación de email, `register` también debe contemplarlo | M |
| T5 | Listar los `.ts` de `src/features/` y `src/lib/` sin un `*.test.ts` al lado, elegir los de lógica pura y escribir sus tests con el ciclo rojo-verde-refactor de [`testing.md`](../guides/testing.md#flujo-con-strict-tdd) | M |
| T6 | Mantener [`guides/testing.md`](../guides/testing.md#problemas-conocidos) al día al cerrar cada tarea | B |

## Preguntas de autoevaluación

1. ¿Por qué un test que falla en su `beforeEach` (como el del cajón de IA) hace fallar a todos los tests de su archivo?
2. ¿Por qué el borrador de un artículo no tiene todavía `id` cuando entrás a `/editor/new`, y cómo lo descubre el test?
3. ¿Qué diferencia hay entre `getByRole("button", { name: "Continuar" })` y buscar por una clase CSS, y cuál sobrevive mejor a un rediseño?
4. ¿Por qué el spec del cajón de IA intercepta `/api/ai/chat` en vez de llamar a Gemini?
5. ¿Qué riesgo trae crear cuentas de prueba con la `SUPABASE_SECRET_KEY` y cómo lo evitarías?
6. ¿Qué pasó para que nadie notara los tests rotos, y qué cambiaría con CI?
