# PRD-X.2 — Herramientas de desarrollo: seed, verificación de escrituras y prueba de Gemini

| Campo | Valor |
| :--- | :--- |
| **Padre** | [PRD-global](../PRD-global-vision.md) (paquete transversal) |
| **Dificultad** | Básica (B) |
| **Esfuerzo** | S (1 día) |
| **Dueño sugerido** | D4 |
| **Mentor** | D1 |
| **Depende de** | [PRD-2.1](PRD-2.1-posts-data-rls.md) (las escrituras de `posts` que verifica), [PRD-5.1](PRD-5.1-ai-foundation.md) (la integración con Gemini que prueba), [PRD-8.1](PRD-8.1-chat-server.md) (las herramientas del chat que replica) |
| **Código** | `scripts/seed-dev.mjs`, `scripts/verify-post-writes.mjs`, `scripts/ai-smoke.mjs`, los tres scripts de `package.json`, [`docs/guides/getting-started.md`](../guides/getting-started.md) |
| **ADRs** | [0012](../adr/0012-integridad-de-escritura-de-posts.md) (integridad de escritura), [0016](../adr/0016-migraciones-sql-manuales.md) (migraciones manuales), [0017](../adr/0017-politica-de-thinking-y-reintentos-gemini.md) (política de Gemini) |

## Resumen

Tres scripts de Node que **no son parte de la aplicación** pero hacen posible trabajar en ella: uno **carga datos de prueba**, otro **comprueba que el navegador no pueda saltarse la moderación** y otro **verifica que Gemini responde** con lo que la app espera. Este paquete es el más chico: se trata de entender qué hace cada script, mantenerlos alineados con el código y corregir los desfases que ya se detectaron.

## Qué necesitás entender antes

- [ ] Qué es un script `.mjs` y cómo se ejecuta con `node --env-file=.env.local` (mirá los tres scripts de `package.json`).
- [ ] La diferencia entre la **publishable key** (la usa el navegador, respeta RLS) y la **secret key** (solo servidor, **salta RLS**). Glosario en [`docs/README.md`](../README.md#glosario).
- [ ] Qué es RLS a grandes rasgos: reglas de la base que deciden qué filas puede leer o escribir cada usuario.

## Alcance / fuera de alcance

| Entra | No entra |
| :--- | :--- |
| Entender y ejecutar los tres scripts | Escribir la lógica de moderación o del chat (son [PRD-5.3](PRD-5.3-publish-moderation.md) y [PRD-8.1](PRD-8.1-chat-server.md)) |
| Corregir el desfase de email entre el seed y `verify-post-writes.mjs` | Los tests de `e2e/` (son [PRD-X.1](PRD-X.1-testing-e2e.md)) |
| Mantener [`getting-started.md`](../guides/getting-started.md) actualizado | Cambiar el esquema de la base |

## Cómo funciona

| Script | Comando | Qué hace | Necesita |
| :--- | :--- | :--- | :--- |
| `scripts/seed-dev.mjs` | `pnpm seed:dev` | Crea cuatro usuarios de prueba y les carga artículos, notas (sueltas y respuestas), tags, likes, lecturas y seguimientos. Es idempotente: se puede correr varias veces | `.env.local` con las tres variables de Supabase y las migraciones `0005` a `0007` |
| `scripts/verify-post-writes.mjs` | `pnpm verify:writes` | Inicia sesión como un usuario sembrado y **intenta** escrituras prohibidas (publicar directo, tocar `status` o columnas de IA) y permitidas. Imprime `PASS` o `FAIL` por cada una, limpia lo que crea y termina con código distinto de cero si algo falla | El seed cargado y la migración `0007` |
| `scripts/ai-smoke.mjs` | `pnpm ai:smoke` | Con la `GEMINI_API_KEY` lista los modelos Flash disponibles, hace **una** llamada con salida JSON estructurada y **dos** de function calling (un pedido simple y uno de varios cambios). Consume cuota gratuita y no imprime la clave | `GEMINI_API_KEY` |

Orden de lectura sugerido:

1. **`seed-dev.mjs`, cabecera (líneas 1 a 10).** Explica dos decisiones: las cuentas se crean con el Admin API (secret key) porque el registro público rechaza dominios sin MX, y los artículos se insertan con la secret key porque, tras la migración `0007`, el cliente ya no puede escribir `status` ni `published_at`. Todo lo demás (perfil, tags, likes, lecturas, seguimientos) se hace **como cada usuario, bajo RLS**, igual que la app.
2. **Los usuarios sembrados.** Todos con la contraseña `Seed-Password-123`:

   | Username | Email |
   | :--- | :--- |
   | `lucia_dev` | `lucia.seed@blog-ia.test` |
   | `mateo_ia` | `mateo.seed@blog-ia.test` |
   | `sofi_writes` | `sofia.seed@blog-ia.test` |
   | `nico_tech` | `nicolas.seed@blog-ia.test` |

3. **`verify-post-writes.mjs`.** La función `check(nombre, ok)` acumula resultados; `isBlocked` distingue "la base lo rechazó" (`42501`) de un error cualquiera, que **no** prueba protección. Al final `process.exit(failed ? 1 : 0)`.
4. **`ai-smoke.mjs`.** Las tres partes (modelos, JSON, function calling). Las expectativas "blandas" del segundo caso solo imprimen un aviso y no hacen fallar la corrida.

## Decisiones y por qué

| Decisión | Por qué |
| :--- | :--- |
| Scripts de Node en `scripts/` y no seeds SQL | No hay `supabase/config.toml` ni CLI local ([ADR 0016](../adr/0016-migraciones-sql-manuales.md)); un script puede usar la API de auth para crear usuarios reales |
| Los posts del seed usan la secret key | La migración `0007` quita al cliente el permiso de escribir `status` y `published_at` ([ADR 0012](../adr/0012-integridad-de-escritura-de-posts.md)); consta en la cabecera del script |
| `verify:writes` prueba con la publishable key y sesión de usuario | Reproduce exactamente lo que podría hacer alguien desde el navegador; consta en su cabecera |
| `ai-smoke.mjs` copia a mano las declaraciones de herramientas | Es `.mjs` y no puede importar el módulo TypeScript; su comentario dice que hay que mantenerlas sincronizadas a mano. Consecuencia: pueden divergir sin que nadie lo note |

## Criterios de aceptación

- [ ] Alguien nuevo corre `pnpm seed:dev` en un proyecto de desarrollo y ve contenido en el feed.
- [ ] `pnpm verify:writes` **pasa** después de un seed limpio (hoy falla por el desfase de email, tarea T1).
- [ ] `pnpm ai:smoke` termina en `OK` con una `GEMINI_API_KEY` válida.
- [ ] [`getting-started.md`](../guides/getting-started.md) describe los tres scripts y los usuarios sembrados sin contradecir el código.

## Cómo verificarla a mano

1. Configurar `.env.local` según [getting-started](../guides/getting-started.md) (Supabase de **desarrollo**, nunca producción).
2. `pnpm seed:dev`. Tiene que terminar con "Listo. Contraseña de las cuentas de prueba…". Volvé a correrlo: no debe duplicar nada.
3. `pnpm dev`, abrir `http://localhost:3000` e iniciar sesión con `mateo_ia` y `Seed-Password-123` para ver los datos.
4. `pnpm verify:writes`. Hoy debería fallar en el inicio de sesión: es el problema de la tarea T1.
5. `pnpm ai:smoke` (gasta unas pocas peticiones de la cuota gratuita).

## Trabajo pendiente asignable

| # | Tarea | Dif. |
| :--- | :--- | :--- |
| T1 | **Desfase de email.** `verify-post-writes.mjs` inicia sesión como `mateo_ia.seed@blog-ia.test`, pero el seed crea al usuario `mateo_ia` como `mateo.seed@blog-ia.test`. Lo más simple es cambiar el email en `verify-post-writes.mjs`; renombrar la cuenta en el seed dejaría usuarios duplicados en los proyectos que ya lo corrieron. Comprobarlo con `pnpm seed:dev && pnpm verify:writes` | B |
| T2 | **Declaraciones de herramientas de `ai-smoke.mjs` desalineadas.** El script declara `propose_edit` y `update_plan`, pero el chat real (`CHAT_TOOL_DECLARATIONS` en `src/features/ai/function-calls.ts`) declara `propose_edit` y `present_analysis`, y no declara `update_plan`. Además el `label` del real tiene `maxLength`. Documentar la diferencia y proponer al mentor cómo mantenerlas alineadas (por ejemplo, un test unitario que compare ambas). Declarar `update_plan` en producción es una decisión del paquete [PRD-8.1](PRD-8.1-chat-server.md) | M |
| T3 | Al cerrar T1, actualizar la nota del desfase en [`getting-started.md`](../guides/getting-started.md) y en [`testing.md`](../guides/testing.md#problemas-conocidos) | B |
| T4 | Comprobar que la lista de usuarios sembrados de `getting-started.md` sigue coincidiendo con `USERS` en `seed-dev.mjs` | B |

## Preguntas de autoevaluación

1. ¿Por qué el seed usa la secret key para insertar artículos pero no para los likes?
2. ¿Qué diferencia hay entre la publishable key y la secret key, y qué pasaría si la secret key llegara al navegador?
3. ¿Por qué `verify:writes` considera bloqueada una escritura solo si el error es `42501` o si no afectó filas?
4. ¿Qué significa que el seed sea idempotente y cómo lo logra?
5. ¿Qué riesgo hay en que `ai-smoke.mjs` tenga su propia copia de las herramientas del chat?
6. ¿Por qué estos scripts se ejecutan solo contra un proyecto de desarrollo?
