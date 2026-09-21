# Testing

El proyecto trabaja con Strict TDD: primero el test que falla, luego el código mínimo que lo pasa, luego refactor. Hay dos niveles de prueba y tres scripts de verificación. No hay CI: todo se corre a mano ([ADR 0018](../adr/0018-sin-ci-gates-manuales.md)).

| Nivel | Herramienta | Qué cubre | Comando | Necesita |
| :--- | :--- | :--- | :--- | :--- |
| Unitario | Vitest | Lógica pura: esquemas, IA, posts, recomendaciones | `pnpm test` | Nada (sin red ni base) |
| End-to-end | Playwright | Flujos en navegador contra Supabase real | `pnpm test:e2e` | `.env.local`, proyecto de Supabase de desarrollo, migraciones `0001` a `0007` |
| Verificación de escrituras | Script Node | Que el navegador no pueda saltarse la moderación | `pnpm verify:writes` | Proyecto real con `0007` y el seed |
| Verificación de Gemini | Script Node | Que el modelo responde y devuelve JSON válido | `pnpm ai:smoke` | `GEMINI_API_KEY` |

> **Estado de los e2e (importante).** Al escribir este documento los e2e **no se pueden dar por buenos**: hay desfases conocidos entre los tests y la interfaz (ver [Problemas conocidos](#problemas-conocidos)). Los tests unitarios sí son la red de seguridad confiable.

## Tests unitarios (Vitest)

| Aspecto | Detalle |
| :--- | :--- |
| Configuración | `vitest.config.mts`: entorno `node`, incluye `src/**/*.test.ts`, alias `@` a `src/` |
| Ubicación | Junto al archivo probado (`src/features/<dominio>/schemas.test.ts`, `apply-action.test.ts`…) |
| Cantidad | 38 archivos |
| Ejecución | `pnpm test` (una vez) o `pnpm test:watch` |

Los archivos por área:

| Área | Archivos | Qué se prueba |
| :--- | :--- | :--- |
| IA: protocolo y modelo (17, en `src/features/ai/`) | `stream-protocol`, `stream-response`, `function-calls`, `chat-stream`, `chat-history`, `first-chunk-deadline`, `thinking`, `errors`, `route-helpers`, `schemas`, `prompts`, `output`, `words`, `moderation`, `rate-limit`, `cache`, `cached-feature` | El parser NDJSON, las herramientas y su validación, el recorte de acciones y de historial, el plazo del primer fragmento, el mapeo de errores, Origin/tamaño/JSON, los esquemas, los prompts y sus delimitadores, la moderación y sus decisiones, el limitador y la caché |
| IA: interfaz (5) | `components/ai-client`, `components/ai-ui`, `components/chat/ai-drawer`, `chat-client`, `chat-state` | Cliente del stream, estado del chat (planes, propuestas, superposición), atajo del cajón |
| Editor y motor de aplicar (3, en `src/features/posts/components/editor/`) | `editor-context`, `apply-action`, `action-overlap` | Bloques, fingerprints, localización, aplicar, límites, superposición ([ADR 0014](../adr/0014-aplicacion-de-ediciones-en-el-cliente-con-fingerprints.md)) |
| Posts (5, en `src/features/posts/`) | `schemas`, `utils`, `limits`, `link-safety`, `publish` | Esquemas (incluye `feedQuerySchema`), `excerpt`, límites de longitud, enlaces seguros y el reclamo de publicación |
| Imágenes (2, en `src/features/posts/images/`) | `image-utils`, `image-markdown` | Validación y tamaño de origen, dimensiones de destino, rutas, dimensiones en el nombre, allow-list de URLs, texto alternativo y la ida y vuelta de `![alt](url)` por Tiptap |
| Otros dominios (4) | `auth/schemas`, `profile/schemas`, `likes/schemas`, `recommendations/scoreByTags` | Validaciones y el ranking de tags |
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
| Cantidad | 67 tests en 5 specs |

| Archivo | Tests | Qué cubre |
| :--- | :--- | :--- |
| `e2e/auth.spec.ts` | 15 | Protección de rutas, feed público, registro, login por email y por username (ignora mayúsculas, error genérico en los tres casos de fallo), logout, edición de nombre y username en `/settings`, duplicados de email y de username |
| `e2e/posts.spec.ts` | 8 | Borrador con autoguardado, tags sin duplicados y reutilizables entre usuarios, error al publicar vacío, publicación, 404 para borradores ajenos e ids inválidos |
| `e2e/feed.spec.ts` | 10 | El feed vive en `/` y `/feed` no existe, filtro por tag por URL, tags que no se muestran a lectores, borradores fuera del feed, página de autor (404), seguir y dejar de seguir |
| `e2e/shell.spec.ts` | 8 | Barra superior e inferior, botón "+", ausencia de scroll horizontal a 360 px, navegación en escritorio |
| `e2e/editor-ai-drawer.spec.ts` | 26 | Cajón de IA: atajo `Cmd/Ctrl+I`, foco, persistencia, columna del artículo, streaming, marcador de "pensando", límite con cuenta regresiva, corte del stream, y toda la vida de una propuesta (tarjeta, aplicar, deshacer, descartar, `stale`, selección, "aplicar todo", superposición, insertar en cursor, límite de longitud, sin desborde horizontal) |
| `e2e/helpers.ts` | — | `register`, `createDraft`, `uniqueEmail`, `uniqueUsername`, `PASSWORD`, `HOME_URL` |

**El cajón de IA se prueba con el stream simulado.** `editor-ai-drawer.spec.ts` intercepta `POST /api/ai/chat` con `page.route` y responde con NDJSON armado a mano (`ndjson(...)`), así no llama a Gemini ni gasta cuota. Lo que sí toca la base real es el registro del usuario y la creación del borrador.

Prerrequisitos:

1. `.env.local` configurado, incluida `SUPABASE_SECRET_KEY` ([getting-started](getting-started.md)), y las migraciones `0001` a `0007` aplicadas en un proyecto de **desarrollo**.
2. Navegador de Playwright instalado. Si falta: `pnpm exec playwright install chromium`.

Convenciones observadas:

- Cada test registra un usuario nuevo con `register(page)` (email y username únicos) para no depender de datos previos.
- `createDraft(page)` crea un borrador y devuelve el id del post.
- Los selectores usan el texto de la interfaz en español (`getByLabel`, `getByRole`, `getByText`). Cambiar un texto visible puede romper un test.
- Cada corrida crea usuarios reales en el proyecto de Supabase configurado.

## Problemas conocidos

Verificados leyendo `e2e/` contra `src/`; los e2e no se ejecutaron al escribir esta guía.

| Problema | Efecto | Salida prevista |
| :--- | :--- | :--- |
| `uniqueEmail()` genera `@example.com`. Según se comprobó antes contra un proyecto real, el registro público de Supabase rechaza esos dominios | `register(page)` falla y con él casi todos los e2e | Crear las cuentas de prueba con el Admin API (como `scripts/seed-dev.mjs`) y loguearse por la interfaz |
| `createDraft` y `shell.spec.ts` pulsan un botón "Nuevo post" que **ya no existe** (la creación pasó al botón "+" / menú "Crear") | Todo test que use `createDraft`, incluido `beforeEach` de `editor-ai-drawer.spec.ts`, falla | Crear el borrador navegando a `/editor/new` y escribiendo, o pasar por el menú "Crear" |
| `shell.spec.ts` espera tres destinos (Inicio, Mis posts, Perfil) | La barra inferior tiene hoy cuatro (Inicio, Explorar, Actividad, Perfil) | Actualizar la aserción |
| `scripts/verify-post-writes.mjs` inicia sesión como `mateo_ia.seed@blog-ia.test`, pero `scripts/seed-dev.mjs` crea a ese usuario como `mateo.seed@blog-ia.test` | Tras un seed nuevo, `pnpm verify:writes` falla con "No pude iniciar sesión como mateo_ia" (no se ejecutó al escribir esto: se detectó comparando los dos scripts) | Unificar el email en uno de los dos scripts |
| El helper `register` asume que el proyecto de Supabase no exige confirmación de email | Sin verificar; la configuración de Supabase no está en el repositorio | Documentar el ajuste del proyecto |

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
