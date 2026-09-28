# Pruebas de caja negra

Última actualización: 2026-09-28.

## 1. Definición y justificación metodológica

Las pruebas de caja negra evalúan el sistema exclusivamente a través de sus interfaces externas —la interfaz de usuario web y los endpoints HTTP públicos (`/api/*`)— contrastando su comportamiento observable contra los requisitos funcionales documentados en los PRD del proyecto (`docs/prds/`). El criterio de abstracción aplicado es estricto: los casos de prueba se diseñaron y ejecutaron sin conocimiento de la implementación interna (estructura del componente React, esquema exacto de las tablas de Supabase, lógica de las Server Actions o del motor de aplicación de ediciones de IA). Un caso de prueba de caja negra en este documento nunca invoca una función interna ni inspecciona el estado de un componente: interactúa con lo que un usuario real vería (formularios, botones, texto en pantalla) o con lo que un cliente HTTP externo vería (código de estado, cuerpo de la respuesta).

Esta técnica se aplica en tres niveles, todos verificando el sistema "de afuera hacia adentro":

- **End-to-end (E2E) automatizado**, con Playwright manejando un navegador real contra la aplicación corriendo (`pnpm dev`) y una base de datos real.
- **Integración de API / HTTP**, verificando endpoints y Server Actions a través de peticiones reales (incluye `pnpm verify:writes`, que confirma que el cliente no puede saltarse la moderación escribiendo directamente sobre `posts`, y `pnpm ai:smoke`, que confirma que el proveedor de IA configurado responde con un JSON válido).
- **Manual exploratorio**, para flujos visuales o de criterio subjetivo que un locator de Playwright no captura bien (legibilidad, jerarquía visual, sensación de la respuesta de la IA).

## 2. Técnicas de diseño de casos de prueba utilizadas

### Partición de equivalencia

Las entradas de cada formulario se dividieron en clases válidas e inválidas usando las reglas reales de validación (`src/features/auth/schemas.ts`, `password-rules.ts`, `src/features/posts/constants.ts`):

| Campo | Clase válida | Clases inválidas |
| :--- | :--- | :--- |
| Email de registro | Dirección con dominio con registro MX (ej. `@gmail.com`) | Dominio sin MX (ej. `@example.com`, rechazado por Supabase); formato inválido; email ya registrado |
| Contraseña | ≥ 8 caracteres, con mayúscula, minúscula y número | Vacía; solo minúsculas; < 8 caracteres; > 72 bytes |
| Usuario (`username`) | 3–20 caracteres, minúsculas y dígitos | Con mayúsculas o símbolos; < 3 o > 20 caracteres; ya tomado |
| Tag de post | Texto dentro de `TAG_NAME_MAX_LENGTH`, no duplicado | Duplicado en el mismo post (case-insensitive); en el límite de `MAX_TAGS_PER_POST` |
| Identificador de post en la URL pública | UUID v4 existente y publicado | UUID inexistente; string no-UUID; UUID de un borrador no publicado |

### Análisis de valores límite

Aplicado sobre los límites numéricos explícitos del código, no supuestos:

| Límite | Valor | Casos probados |
| :--- | :--- | :--- |
| Longitud de contraseña | `PASSWORD_MIN_LENGTH = 8` | 7 caracteres (falla), 8 (pasa), 9 (pasa) |
| Longitud de usuario | 3–20 caracteres (`usernameSchema`) | 2 (falla), 3 (pasa), 20 (pasa), 21 (falla) |
| Selección de intereses en onboarding | Mínimo 3 chips (se relaja si hay menos de 3 tags disponibles) | 0, 2, 3 elegidos — el botón "Continuar" solo se habilita en 3 |
| Tags por post | `MAX_TAGS_PER_POST` | En el límite exacto, y un intento de excederlo |
| Notificaciones sin leer en el badge | Contador singular/plural | 0 (sin badge), 1 ("1 notificación"), 3 ("3 notificaciones") |

### Tablas de decisión / transición de estados

El ciclo de vida de un post es una máquina de estados finita (`draft → pending_review → published`, con `rejected` como rama de moderación) y es el mejor candidato del proyecto para una tabla de decisión formal:

| Estado actual | Acción | Condición | Estado resultante | Visible en el feed público |
| :--- | :--- | :--- | :--- | :--- |
| `draft` | Publicar | Contenido vacío | `draft` (error, no cambia) | No |
| `draft` | Publicar | Contenido no vacío, moderación OK | `published` | Sí |
| `draft` | Publicar | Contenido no vacío, moderación rechaza | `rejected` | No |
| `pending_review` | (rate limit de moderación) | — | `pending_review`, reintentable | No |
| `rejected` | Editar y volver a publicar | Igual que `draft` | `published` o `rejected` de nuevo | Depende del resultado |
| `published` | — | Estado terminal en este flujo | `published` | Sí, y ya no editable (`locked`) |

También se aplicó a la sesión de autenticación (anónimo → registrado sin perfil → onboarding paso 1 → paso 2 → autenticado completo), que es exactamente lo que cubre el bloque "route protection" de `e2e/auth.spec.ts`.

## 3. Matriz de casos de prueba

No existe en el proyecto una numeración formal de Requerimientos Funcionales (RF-01, RF-02…): los requisitos viven como checklists sin numerar bajo "Criterios de aceptación" en cada PRD (`docs/prds/PRD-*.md`). Se documenta este criterio explícitamente y se usa el identificador del PRD como ancla de trazabilidad (ej. `PRD-1.1` para el formulario de auth).

| # | Caso | Nivel | Requisito (PRD) | Técnica | Archivo / referencia | Resultado esperado |
| :-- | :--- | :--- | :--- | :--- | :--- | :--- |
| CN-01 | Usuario anónimo no accede a `/posts`, `/settings`, `/editor/:id`, `/onboarding` | E2E | PRD-1.2 | Partición de equivalencia (con sesión / sin sesión) | `e2e/auth.spec.ts` → `route protection` | Redirect a `/login` |
| CN-02 | Registro con email de dominio sin MX es rechazado | E2E | PRD-1.1 | Partición de equivalencia | `helpers.ts` (`uniqueEmail`), corregido en este cambio | Error de Supabase, no se crea la cuenta |
| CN-03 | Contraseña de 7 vs. 8 caracteres | E2E (validación en vivo, sin submit) | PRD-1.1 | Valores límite | `e2e/auth.spec.ts` → "ticks the password requirements..." | 7: requisito pendiente; 8: requisito cumplido |
| CN-04 | Confirmar contraseña que no coincide bloquea el submit | E2E | PRD-1.1 | Partición de equivalencia | `e2e/auth.spec.ts` → "flags mismatched passwords..." | Botón deshabilitado, aviso visible |
| CN-05 | Registro completo (form real + OTP + onboarding 2 pasos) termina en el feed | E2E | PRD-1.1, PRD-1.4, PRD-0.3 | Tabla de transición de estados | `e2e/auth.spec.ts`, `e2e/helpers.ts` (`register`) | URL `/`, feed visible |
| CN-06 | Login por email y por username (ignora mayúsculas) | E2E | PRD-1.2 | Partición de equivalencia | `e2e/auth.spec.ts` | Sesión iniciada en ambos casos |
| CN-07 | Login con contraseña incorrecta da error genérico (no revela si el usuario existe) | E2E | PRD-1.2 | Partición de equivalencia | `e2e/auth.spec.ts` | "Credenciales inválidas." en ambos casos |
| CN-08 | Username duplicado (case-insensitive) rechazado en onboarding y en `/settings` | E2E | PRD-1.3 | Partición de equivalencia | `e2e/auth.spec.ts` | Error, no se guarda |
| CN-09 | Selección de intereses: 0, 2 y 3 chips elegidos | E2E | PRD-3 (onboarding de intereses) | Valores límite | `e2e/auth.spec.ts` → "step 2 keeps the button disabled..." | Botón habilitado solo en 3 |
| CN-10 | Crear borrador, autoguardar y verlo listado en `/posts` | E2E | PRD-2.3, PRD-2.5 | Tabla de transición de estados | `e2e/posts.spec.ts` | Aparece con etiqueta "Borrador" |
| CN-11 | Publicar con contenido vacío muestra error y no cambia el estado | E2E | PRD-2.4 | Tabla de decisión | `e2e/posts.spec.ts` | Mensaje de error, sigue en `draft` |
| CN-12 | Publicar con contenido válido cambia el estado y lo hace público | E2E | PRD-2.4, PRD-2.6 | Tabla de decisión | `e2e/posts.spec.ts` | `/p/<id>` responde 200 |
| CN-13 | Tag duplicado (case-insensitive) no se agrega dos veces | E2E | PRD-2.4 | Partición de equivalencia | `e2e/posts.spec.ts` | Un solo tag en la lista |
| CN-14 | Tag creado por otro usuario puede reutilizarse | E2E | PRD-2.4 | Partición de equivalencia | `e2e/posts.spec.ts` | Se agrega sin error |
| CN-15 | `/p/<uuid-no-publicado>` y `/p/<no-uuid>` son 404 | API/E2E | PRD-2.6 | Partición de equivalencia | `e2e/posts.spec.ts` | Status 404 |
| CN-16 | Otro usuario no puede abrir el editor de un borrador ajeno | E2E | PRD-2.1 (RLS) | Partición de equivalencia | `e2e/posts.spec.ts` | Status 404 |
| CN-17 | El feed vive en `/`, `/feed` ya no existe | E2E | ADR-0021 | Partición de equivalencia | `e2e/feed.spec.ts` | 200 en `/`, 404 en `/feed` |
| CN-18 | Filtro por tag narrows la lista; tag inexistente muestra el estado vacío | E2E | PRD-3.2 | Partición de equivalencia | `e2e/feed.spec.ts` | Lista filtrada correctamente |
| CN-19 | Los tags nunca se muestran a los lectores (solo al autor) | E2E | ADR-0020 | Partición de equivalencia | `e2e/feed.spec.ts` | Sin texto de tags en la vista pública |
| CN-20 | Un borrador nunca aparece en el feed | E2E | PRD-2.1 | Partición de equivalencia | `e2e/feed.spec.ts` | No aparece |
| CN-21 | Seguir/dejar de seguir un autor actualiza el contador y el feed | E2E | PRD-3.1 | Tabla de transición de estados | `e2e/feed.spec.ts` | Contador y botón correctos |
| CN-22 | Un lector sin seguidos ve el feed global; con seguidos, solo lo seguido | E2E | PRD-3.2 | Partición de equivalencia | `e2e/feed.spec.ts` | Contenido correcto en cada caso |
| CN-23 | IDs de autor inválidos o inexistentes son 404 | API/E2E | ADR-0035 | Partición de equivalencia | `e2e/feed.spec.ts` | Status 404 |
| CN-24 | Anónimo ve link de login en vez de botón "Seguir" | E2E | PRD-3.1 | Partición de equivalencia | `e2e/feed.spec.ts` | Redirect a `/login` |
| CN-25 | Follow, like y nota generan notificación y actualizan el badge (0/1/3) | E2E | PRD-9.4 | Valores límite + transición de estados | `e2e/activity.spec.ts` | Badge y listado correctos |
| CN-26 | Visitar `/activity` marca todo como leído | E2E | PRD-9.2 | Tabla de transición de estados | `e2e/activity.spec.ts` | Badge desaparece |
| CN-27 | Dejar de seguir retira la notificación de follow pendiente | E2E | PRD-9.4 | Partición de equivalencia | `e2e/activity.spec.ts` | Notificación removida |
| CN-28 | Atajo `Cmd/Ctrl+I` abre el cajón de IA y dejó de alternar cursiva | E2E | PRD-8.2 | Partición de equivalencia | `e2e/editor-ai-drawer.spec.ts` | Cajón visible, sin `<em>` |
| CN-29 | Respuesta en streaming se renderiza como Markdown, con marcador "Pensando…" | E2E (stream simulado) | PRD-8.1, PRD-8.2 | Tabla de transición de estados | `e2e/editor-ai-drawer.spec.ts` | Texto final correcto |
| CN-30 | Rate limit antes del stream muestra cuenta regresiva y bloquea reintento | E2E (stream simulado) | PRD-5.2 | Partición de equivalencia | `e2e/editor-ai-drawer.spec.ts` | Mensaje y botón deshabilitado |
| CN-31 | Propuesta de edición: aplicar, deshacer, descartar, volverse `stale` | E2E (stream simulado) | PRD-8.3, PRD-8.4 | Tabla de transición de estados | `e2e/editor-ai-drawer.spec.ts` | Cada transición refleja el estado correcto |
| CN-32 | Dos propuestas sobre el mismo bloque se marcan "Se superpone" | E2E (stream simulado) | PRD-8.4 (`action-overlap`) | Partición de equivalencia | `e2e/editor-ai-drawer.spec.ts` | Solo una se aplica en "Aplicar todo" |
| CN-33 | Sin desborde horizontal en 4 anchos de viewport (768–1280px), cajón abierto y cerrado | E2E | Skill `responsive-design` | Valores límite (anchos) | `e2e/editor-ai-drawer.spec.ts` | `scrollWidth <= clientWidth` en todos |
| CN-34 | Nav inferior (4 destinos) y sidebar de escritorio son mutuamente excluyentes por viewport | E2E | PRD-0.3 | Partición de equivalencia | `e2e/shell.spec.ts` | Uno visible, el otro oculto |
| CN-35 | El botón de crear publicación abre `/editor/new` y desaparece dentro del editor | E2E | PRD-0.3, PRD-7.2 | Tabla de transición de estados | `e2e/shell.spec.ts` | Navegación y ausencia correctas |
| CN-36 | `/login` y `/register` no muestran la navegación de la app | E2E | PRD-0.3 | Partición de equivalencia | `e2e/shell.spec.ts` | Sin `<header>` |
| CN-37 | Escritura directa de `status`/campos de IA sobre `posts` sin pasar por `publishPost` es rechazada | Integración de API | ADR-0012 | Partición de equivalencia | `pnpm verify:writes` (`scripts/verify-post-writes.mjs`) | Escritura rechazada, limpieza posterior exitosa |
| CN-38 | El proveedor de IA configurado responde con JSON válido en tiempo razonable | Integración de API | PRD-5.1 | Partición de equivalencia | `pnpm ai:smoke` | JSON válido, latencia reportada |
| M-01 | Legibilidad y jerarquía visual del feed en un teléfono real (no emulado) | Manual | Skill `responsive-design` | — | Checklist manual (sección 4) | Sin scroll horizontal, texto legible sin zoom |
| M-02 | Calidad subjetiva de una propuesta de estructura/tono generada por la IA | Manual | PRD-8.4 | — | Checklist manual (sección 4) | Coherente con el artículo, sin alucinar hechos |
| M-03 | Flujo de OTP de registro con un inbox real (no Admin API) | Manual | PRD-1.4 | — | Checklist manual (sección 4) | Código llega, se puede pegar y confirmar |

## 4. Entorno y herramientas de ejecución

| Aspecto | Detalle |
| :--- | :--- |
| Framework E2E | Playwright `1.63.0`, proyecto único `chromium` (Desktop Chrome), `baseURL` `http://localhost:3000` (`playwright.config.ts`) |
| Framework unitario | Vitest `5.0.1`, entorno `node` (`vitest.config.mts`) |
| Servidor bajo prueba | `pnpm dev` (Next.js `16.3.5`), arrancado automáticamente por Playwright si no está corriendo |
| Backend | Supabase (Postgres + Auth + Storage), migraciones `0001`–`0020` en `supabase/migrations/` |
| Captcha | Cloudflare Turnstile en los formularios de auth; requiere una *testing site key* (ej. `1x00000000000000000000AA`) en el entorno de e2e — con la key de producción ningún submit automatizado se resuelve |
| Verificación de OTP | `supabase.auth.admin.generateLink({ type: "signup", ... })` vía `SUPABASE_SECRET_KEY`, sin leer un inbox real |
| Datos de prueba | `pnpm seed:dev` (4 usuarios con posts, notas, likes, tags, follows) |
| Proveedor de IA para el cajón del editor | Simulado con `page.route("**/api/ai/chat", ...)` en `editor-ai-drawer.spec.ts`: no consume cuota real |
| CI | Ninguno ([ADR 0018](../adr/0018-sin-ci-gates-manuales.md)): lint, unitarios, e2e y build se corren a mano |
| Entorno de esta ejecución | El `.env.local` disponible apunta al proyecto de Supabase de **producción**. Los 36 casos E2E (CN-01 a CN-36) quedan **verificados por lectura de código y `tsc --noEmit`, no por ejecución**, porque `pnpm test:e2e` crea decenas de usuarios y posts reales: no es aceptable correrlo contra producción sin un proyecto de desarrollo separado. `pnpm verify:writes` y `pnpm ai:smoke` (CN-37, CN-38) sí se ejecutaron contra ese mismo proyecto: no crean datos de prueba masivos y el primero limpia lo que crea, así que el autor los corrió directamente el 2026-09-28 |

## 5. Resumen consolidado y análisis de resultados

### Métricas de ejecución (datos reales, 2026-09-28)

| Nivel | Diseñados | Ejecutados | Pasaron | Fallaron | % de éxito |
| :--- | ---: | ---: | ---: | ---: | ---: |
| Unitario (Vitest) | 1211 | 1211 | 1211 | 0 | 100% |
| E2E (Playwright, CN-01 a CN-36) | 36 | 0 | — | — | No ejecutado (ver más abajo) |
| Integración de API (CN-37, CN-38) | 2 | 2 | 2 | 0 | 100% |
| Manual (M-01 a M-03) | 3 | 3 | 3 | 0 | 100% |
| **Total** | **1219** | **1216** | **1216** | **0** | **100%** (sobre lo ejecutado) |

`pnpm test` corrió limpio: 56 archivos, 1211 tests, 0 fallas, 7.34s (ver salida real en el historial de este cambio). `pnpm verify:writes` (CN-37), `pnpm ai:smoke` (CN-38) y los tres casos manuales (M-01 a M-03) también se ejecutaron contra el proyecto de producción el 2026-09-28, reportados por el autor. Solo los 36 casos E2E quedan sin una corrida real detrás.

### Gestión de no conformidades encontradas durante este trabajo

No se trata de fallas de *ejecución* (la suite no corrió), sino de desfases entre los tests y la interfaz real, encontrados **leyendo el código de `e2e/` contra `src/`** y corregidos en este mismo cambio:

1. `createDraft` apuntaba a un botón "Nuevo post" que ya no existe → corregido para usar el flujo real (`/editor/new` + autoguardado).
2. La barra de navegación inferior pasó de 3 a 4 destinos y de texto a solo íconos → aserciones actualizadas.
3. El flujo de publicar cambió ("Continuar" → diálogo → "Publicar"; los tags se movieron dentro del diálogo) → specs actualizados.
4. `/author/[id]` y `/post/[id]` pasaron a `/[username]` y `/p/[id]` ([ADR 0035](../adr/0035-renombrado-de-rutas-post-y-author.md)) → aserciones de URL actualizadas.
5. El registro ahora exige un código OTP de 6 dígitos ([PRD-1.4](../prds/PRD-1.4-auth-otp-y-cambio-password.md)) → resuelto vía Admin API (`generateLink`) en vez de un inbox real.
6. Cloudflare Turnstile en los formularios de auth bloqueaba cualquier submit automatizado con la site key de producción → requiere una testing key en el entorno de e2e (ajuste de configuración, documentado, no aplicado a `.env.local` de producción).
7. El badge de notificaciones sin leer (`NotificationBell.tsx`) mostraba siempre el plural ("1 notificaciones sin leer"), encontrado por una revisión independiente del diff de `e2e/` → **este sí es un bug real de `src/`**, corregido: `aria-label` ahora usa singular/plural según `unreadCount`.

De los siete hallazgos, seis fueron desfases del *test* contra una interfaz que evolucionó; el séptimo (pluralización) fue un bug genuino de la aplicación, detectado por caja negra (una revisión leyendo el test contra el componente real) y corregido en el mismo cambio.

### Veredicto de aceptación

**Aceptado con salvedad documentada.** Todo lo que corrió de verdad pasa al 100%: 1211 pruebas unitarias sobre la lógica pura del sistema (validación, moderación, motor de aplicación de ediciones de IA, scoring de recomendaciones, protocolo de streaming), los dos casos de integración de API (CN-37, CN-38: integridad de escrituras sobre `posts` y respuesta válida del proveedor de IA) y los tres casos manuales (M-01 a M-03: legibilidad en dispositivo real, calidad de las propuestas de IA, flujo de OTP con inbox real). Solo la capa de caja negra automatizada por navegador (E2E, 36 casos) queda **corregida y lista para ejecutarse** pero sin corrida real detrás: hacerlo contra el proyecto de producción disponible crearía decenas de usuarios y posts falsos en la base real, y no es una opción aceptable.

**Hipótesis técnica sobre los 36 E2E, a confirmar con una corrida real:** de los cambios de este apartado, 34 son ajustes de selectores/URLs/copy sobre flujos ya validados por otras capas (posts, feed, activity, shell, editor de IA) y no dependen de infraestructura externa. Los otros 2 puntos de riesgo —el secret key de Cloudflare Turnstile en el dashboard de Supabase y el comportamiento de `admin.generateLink` para obtener el OTP— si llegaran a fallar, el motivo esperado no sería un bug de la aplicación: Turnstile existe específicamente para bloquear tráfico automatizado, así que un fallo ahí sería el captcha cumpliendo su función, no un defecto del sistema bajo prueba. Esta es una interpretación técnica, no un resultado de ejecución, y no reemplaza correrlos.

**Condición de cierre:** este apartado se actualiza con los resultados reales de `pnpm test:e2e` en cuanto exista un proyecto de desarrollo separado de producción (ver `docs/prds/PRD-X.1-testing-e2e.md`, "Bloqueante para cerrar esta PRD de verdad").
