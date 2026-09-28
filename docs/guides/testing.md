# Testing

El proyecto trabaja con Strict TDD: primero el test que falla, luego el código mínimo que lo pasa, luego refactor. Hay dos niveles de prueba y tres scripts de verificación. No hay CI: todo se corre a mano ([ADR 0018](../adr/0018-sin-ci-gates-manuales.md)).

| Nivel | Herramienta | Qué cubre | Comando | Necesita |
| :--- | :--- | :--- | :--- | :--- |
| Unitario | Vitest | Lógica pura: esquemas, IA, posts, recomendaciones | `pnpm test` | Nada (sin red ni base) |
| End-to-end | Playwright | Flujos en navegador contra Supabase real | `pnpm test:e2e` | `.env.local`, proyecto de Supabase de **desarrollo**, migraciones `0001` a `0020` |
| Verificación de escrituras | Script Node | Que el navegador no pueda saltarse la moderación | `pnpm verify:writes` | Proyecto real con `0007` y el seed |
| Verificación de Gemini | Script Node | Que el modelo responde y devuelve JSON válido | `pnpm ai:smoke` | `GEMINI_API_KEY` |

> **Estado de los e2e (actualizado 2026-09-28).** Los seis desfases de la tabla de abajo (creación de post, nav de 4 destinos, flujo de publicar, `/author` → `/[username]`, dominio de `uniqueEmail`, OTP de registro con Turnstile) están **corregidos en `e2e/helpers.ts` y los specs**. Lo que falta es correrlos: el `.env.local` de este equipo apunta al proyecto de Supabase de **producción**, y correr la suite ahí crearía usuarios y posts reales. Hasta que exista un proyecto de desarrollo separado, la suite queda "verificada por lectura y por `tsc --noEmit`, no por ejecución". Los tests unitarios sí son la red de seguridad confiable y corren limpios: 56 archivos, 1211 tests, en verde (`pnpm test`, 2026-09-28).

## Tests unitarios (Vitest)

| Aspecto | Detalle |
| :--- | :--- |
| Configuración | `vitest.config.mts`: entorno `node`, incluye `src/**/*.test.ts`, alias `@` a `src/` |
| Ubicación | Junto al archivo probado (`src/features/<dominio>/schemas.test.ts`, `apply-action.test.ts`…) |
| Cantidad | 45 archivos |
| Ejecución | `pnpm test` (una vez) o `pnpm test:watch` |

Los archivos por área:

| Área | Archivos | Qué se prueba |
| :--- | :--- | :--- |
| IA: protocolo y modelo (17, en `src/features/ai/`) | `stream-protocol`, `stream-response`, `function-calls`, `chat-stream`, `chat-history`, `first-chunk-deadline`, `thinking`, `errors`, `route-helpers`, `schemas`, `prompts`, `output`, `words`, `moderation`, `rate-limit`, `cache`, `cached-feature` | El parser NDJSON, las herramientas y su validación, el recorte de acciones y de historial, el plazo del primer fragmento, el mapeo de errores, Origin/tamaño/JSON, los esquemas, los prompts y sus delimitadores, la moderación y sus decisiones, el limitador y la caché |
| IA: interfaz (5) | `components/ai-client`, `components/ai-ui`, `components/chat/ai-drawer`, `chat-client`, `chat-state` | Cliente del stream, estado del chat (planes, propuestas, superposición), atajo del cajón |
| Editor y motor de aplicar (3, en `src/features/posts/components/editor/`) | `editor-context`, `apply-action`, `action-overlap` | Bloques, fingerprints, localización, aplicar, límites, superposición ([ADR 0014](../adr/0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)) |
| Posts (5, en `src/features/posts/`) | `schemas`, `utils`, `limits`, `link-safety`, `publish` | Esquemas (incluye `feedQuerySchema`), `excerpt`, límites de longitud, enlaces seguros y el reclamo de publicación |
| Imágenes (2, en `src/features/posts/images/`) | `image-utils`, `image-markdown` | Validación y tamaño de origen, dimensiones de destino, rutas, dimensiones en el nombre, allow-list de URLs, texto alternativo y la ida y vuelta de `![alt](url)` por Tiptap |
| Portada (3, en `src/features/posts/cover/`) | `cover`, `cover-schema`, `cover-draft` | Paleta, elección imagen/texto/nada, extracción de imágenes del markdown, propiedad de la imagen por carpeta del autor, esquema de la portada y borrador del diálogo |
| Otros dominios (8) | `auth/schemas`, `auth/password-rules`, `auth/onboarding-gate`, `profile/schemas`, `interests/schemas`, `interests/selection`, `likes/schemas`, `recommendations/scoreByTags` | Validaciones, las reglas de contraseña, la puerta del onboarding (estados `none`/`interests`/`done`), la selección de intereses (validación, mínimo relajado, contador, diferencias) y el ranking de tags (incluye `withInterestTags`) |
| Transversal (2) | `lib/format`, `components/shared/navigation` | `getInitials`, `formatShortDate`, títulos y ruta activa |

Convenciones observadas:

- Un `describe` por schema o función, con `it` descriptivos en inglés.
- Se comprueba el mensaje de error de Zod (`result.error?.issues[0].message`), porque es texto visible para el usuario.
- Casos inválidos con `it.each` (por ejemplo ids con intentos de inyección en `idSchema`).
- Las dependencias externas se inyectan (`GenerateStructured`, `rateLimit`, `fetcher`) para probar la lógica sin red.
- Solo se prueba lógica pura. Los tests son `.ts`, no `.tsx`: el entorno es `node`, sin DOM. La excepción es `image-markdown.test.ts`, que activa `jsdom` con `// @vitest-environment jsdom` para crear un `Editor` de Tiptap sin montar React.

**Lo que no se prueba con Vitest a propósito:** todo lo que necesita un ProseMirror real, es decir, el adaptador `editor-bridge.ts` (aplicar en Tiptap, `closeHistory`, deshacer) y los componentes React. Eso lo cubren los e2e del cajón de IA.

## Tests end-to-end (Playwright)

| Aspecto | Detalle |
| :--- | :--- |
| Configuración | `playwright.config.ts`: `testDir: ./e2e`, proyecto `chromium` (Desktop Chrome), `baseURL` `http://localhost:3000`, `fullyParallel` |
| Servidor | Playwright arranca `pnpm dev` y lo reutiliza si ya está corriendo (salvo en CI) |
| Reintentos | 2 en CI (`process.env.CI`), 0 en local; `forbidOnly` en CI |
| Cantidad | 77 tests declarados (`test(`) en 5 specs; el bucle de protección de rutas de `auth.spec.ts` ejecuta cuatro, así que Playwright informa 80 |

| Archivo | Tests | Qué cubre |
| :--- | :--- | :--- |
| `e2e/auth.spec.ts` | 25 | Protección de rutas (incluye `/onboarding`), feed público, registro con onboarding en dos pasos (perfil e intereses), botón del paso 2 deshabilitado hasta elegir 3 temas (se omite si hay menos de 3 tags en artículos publicados), retorno al paso 2 desde cualquier página, logout desde el paso 2, contraseñas distintas (aviso en vivo y botón deshabilitado), requisitos de contraseña, mostrar/ocultar, redirecciones del proxy sin perfil (al paso 1) y con el onboarding terminado (de `/onboarding` al feed), logout sin perfil, login por email y por username (ignora mayúsculas, error genérico en los tres casos de fallo), logout, edición de nombre y username en `/settings`, duplicados de email (en `/register`) y de username (en `/onboarding`) |
| `e2e/posts.spec.ts` | 8 | Borrador con autoguardado, tags sin duplicados y reutilizables entre usuarios, error al publicar vacío, publicación, 404 para borradores ajenos e ids inválidos |
| `e2e/feed.spec.ts` | 10 | El feed vive en `/` y `/feed` no existe, filtro por tag por URL, tags que no se muestran a lectores, borradores fuera del feed, página de autor (404), seguir y dejar de seguir |
| `e2e/shell.spec.ts` | 8 | Barra superior e inferior, botón "+", ausencia de scroll horizontal a 360 px, navegación en escritorio |
| `e2e/editor-ai-drawer.spec.ts` | 26 | Cajón de IA: atajo `Cmd/Ctrl+I`, foco, persistencia, columna del artículo, streaming, marcador de "pensando", límite con cuenta regresiva, corte del stream, y toda la vida de una propuesta (tarjeta, aplicar, deshacer, descartar, `stale`, selección, "aplicar todo", superposición, insertar en cursor, límite de longitud, sin desborde horizontal) |
| `e2e/helpers.ts` | — | `register`, `signUpAccount`, `completeOnboarding`, `completeInterests`, `interestChips`, `createDraft`, `uniqueEmail`, `uniqueUsername`, `PASSWORD`, `HOME_URL`, `ONBOARDING_URL`, `INTERESTS_HEADING` |

**El cajón de IA se prueba con el stream simulado.** `editor-ai-drawer.spec.ts` intercepta `POST /api/ai/chat` con `page.route` y responde con NDJSON armado a mano (`ndjson(...)`), así no llama a Gemini ni gasta cuota. Lo que sí toca la base real es el registro del usuario y la creación del borrador.

Prerrequisitos:

1. `.env.local` configurado, incluida `SUPABASE_SECRET_KEY` ([getting-started](getting-started.md)), y las migraciones `0001` a `0010` aplicadas en un proyecto de **desarrollo**. Para que el paso 2 del onboarding ofrezca temas hace falta que haya artículos publicados con tags (`pnpm seed:dev` los carga); con menos de 3, el mínimo se relaja y `completeInterests` elige los que haya.
2. Navegador de Playwright instalado. Si falta: `pnpm exec playwright install chromium`.

Convenciones observadas:

- Cada test registra un usuario nuevo con `register(page)` (email y username únicos) para no depender de datos previos. `register` = `signUpAccount` (email y contraseña; termina en `/onboarding`) + `completeOnboarding` (paso 1: nombre y username) + `completeInterests` (paso 2: elige hasta 3 chips y continúa) y espera el feed. Los tests del onboarding usan los pasos por separado.
- `createDraft(page)` crea un borrador y devuelve el id del post.
- Los selectores usan el texto de la interfaz en español (`getByLabel`, `getByRole`, `getByText`). Cambiar un texto visible puede romper un test.
- Cada corrida crea usuarios reales en el proyecto de Supabase configurado.

## Problemas conocidos

Verificados leyendo `e2e/` contra `src/` el 2026-09-28. Todas las filas de la tabla original quedaron **corregidas en código**; ninguna se confirmó todavía con una corrida real de `pnpm test:e2e` porque el `.env.local` disponible apunta a producción (ver el aviso de arriba).

| # | Problema (histórico) | Corrección aplicada |
| :--- | :--- | :--- |
| 1 | `createDraft` pulsaba un botón "Nuevo post" que ya no existe | `createDraft` ahora entra por el link "Nuevo artículo" de `/posts`, escribe un título y espera que `use-autosave.ts` cambie la URL a `/editor/<uuid>` |
| 2 | `shell.spec.ts` esperaba el mismo botón "Nuevo post" para crear y para el check de "sin sesión" | Ahora usa el disparador real `aria-label="Crear publicación"` (`CreatePostMenu`, desktop) → link "Artículo" |
| 3 | `shell.spec.ts` esperaba tres destinos en la barra inferior (Inicio, Mis posts, Perfil) | Actualizado a los cuatro reales: Inicio, Explorar, Actividad, Perfil (iconos con `aria-label`, sin texto visible — el test ahora verifica por nombre accesible, no por `toHaveText`) |
| 4 | `shell.spec.ts` y `feed.spec.ts` esperaban un link "Tu perfil" | Reemplazado por el botón "Menú de cuenta" (`AccountDrawer`) → link "Ajustes" dentro del drawer; el título de `/settings` es "Settings" (gap conocido de mezcla de idiomas, no se tocó) |
| 5 | `posts.spec.ts` y `feed.spec.ts` pulsaban "Publicar" directo y usaban el texto viejo del error de post vacío | Ahora pulsan "Continuar" (abre `PublishDialog`), agregan tags **dentro** del diálogo (se movieron ahí) y usan "Publicar" del diálogo; el texto de error es "El artículo no puede estar vacío para publicarlo." | 
| 6 | `uniqueEmail()` generaba `@example.com`, sin MX, rechazado por Supabase | Cambiado a un dominio con MX real (`@gmail.com`); no se necesita el Admin API para esto |
| 7 *(nuevo, no estaba en la auditoría original)* | `/author/[id]` y `/post/[id]` pasaron a `/[username]` y `/p/[id]` ([ADR 0035](../adr/0035-renombrado-de-rutas-post-y-author.md)); los links internos apuntan directo a la ruta nueva, no al redirect | Las aserciones de URL de `feed.spec.ts` y `activity.spec.ts` ahora comparan contra `/${username}` y `/p/${id}` |
| 8 *(nuevo)* | El registro exige un código OTP de 6 dígitos ([PRD-1.4](../prds/PRD-1.4-auth-otp-y-cambio-password.md)); un test no puede leer un email real | `signUpAccount` ahora completa `/register` de verdad, y en `/verify` obtiene el código con `supabase.auth.admin.generateLink({ type: "signup", ... })` (Admin API) en vez de un buzón — **sin verificar todavía contra un proyecto real** |
| 9 *(nuevo)* | `RegisterForm`, `LoginForm`, `VerifyOtpForm`, `ForgotPasswordForm` y `ChangePasswordForm` tienen Cloudflare Turnstile; con la site key de **producción** ningún submit automatizado pasa el captcha | Requiere una testing site key de Cloudflare (ej. `1x00000000000000000000AA`) en el `.env.local` usado para e2e — ajuste de entorno, no de código |
| — | `scripts/verify-post-writes.mjs` inicia sesión como `mateo_ia.seed@blog-ia.test`, pero `scripts/seed-dev.mjs` crea a ese usuario como `mateo.seed@blog-ia.test` | Sin tocar: es la tarea T1 de [PRD-X.2](../prds/PRD-X.2-dev-tooling.md), fuera de este paquete |

## Scripts de verificación

| Script | Qué hace |
| :--- | :--- |
| `pnpm seed:dev` (`scripts/seed-dev.mjs`) | Carga cuatro usuarios con artículos, notas, likes, lecturas, tags y seguimientos. Idempotente. Ver [getting-started](getting-started.md#datos-de-prueba) |
| `pnpm verify:writes` (`scripts/verify-post-writes.mjs`) | Como usuario sembrado, intenta escrituras prohibidas sobre `posts` (publicar directo, escribir `status` o columnas de IA) y las permitidas, y limpia lo que crea. Termina con código distinto de cero si algo no coincide. Confirma [ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md) |
| `pnpm ai:smoke` (`scripts/ai-smoke.mjs`) | Con la `GEMINI_API_KEY` verifica el modelo y una salida JSON válida y muestra la latencia. No imprime la clave |

## Flujo con Strict TDD

1. Escribir el test (rojo) junto al archivo, por ejemplo `schemas.test.ts`.
2. Ejecutar `pnpm test` y confirmar que falla por el motivo esperado.
3. Implementar lo mínimo para pasar (verde).
4. Refactorizar con los tests en verde.
5. Si el cambio altera un flujo visible, agregar o ajustar el caso en `e2e/` (y comprobar que el helper que usa sigue vigente).
6. Si toca escrituras de `posts`, correr `pnpm verify:writes`.
