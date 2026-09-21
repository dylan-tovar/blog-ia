# 0018. Sin CI ni hooks: las verificaciones de calidad se corren a mano

- **Estado:** Aceptada
- **Fecha:** 2026-09-20 (escrito después de implementar; describe el estado del repositorio, no una discusión registrada)
- **Fuentes:** `package.json` (scripts), `playwright.config.ts`, `vitest.config.mts`, [testing](../guides/testing.md), [ADR 0016](0016-migraciones-sql-manuales.md)

## Contexto

En el repositorio no existe `.github/`, ni Husky, ni lint-staged, ni configuración de despliegue. Aun así hay tres verificaciones que sostienen la calidad: lint, tests unitarios y tests end-to-end.

## Decisión

Las verificaciones **se ejecutan a mano** antes de dar un cambio por bueno; no hay pipeline ni hooks que las fuercen.

| Verificación | Comando | Qué garantiza | Requisitos |
| :--- | :--- | :--- | :--- |
| Lint | `pnpm lint` | Reglas de ESLint (`eslint-config-next`) | Ninguno |
| Unitarios | `pnpm test` | 36 archivos Vitest en `node`: lógica pura de IA, posts, recomendaciones, esquemas | Ninguno (sin red ni base) |
| End-to-end | `pnpm test:e2e` | Flujos en navegador contra la app | `.env.local`, un proyecto de Supabase real de desarrollo y las migraciones `0001` a `0007` |
| Escrituras de `posts` | `pnpm verify:writes` | Que el navegador no pueda saltarse la moderación ([ADR 0012](0012-integridad-de-escritura-de-posts.md)) | Proyecto real con `0007` aplicada y el seed |
| Modelo de IA | `pnpm ai:smoke` | Que `GEMINI_MODEL` responde y devuelve JSON válido | `GEMINI_API_KEY` |
| Build | `pnpm build` | Compilación y tipos de producción | Variables públicas de Supabase (`src/lib/env.ts` las valida al importarse; no se probó el build sin ellas) |

`playwright.config.ts` ya contempla un entorno de CI (`forbidOnly` y dos reintentos cuando `process.env.CI` está definida, y no reutiliza un servidor existente), pero no hay ningún entorno que lo use.

## Alternativas consideradas

Las marcadas con † son razonamiento reconstruido a partir del código, no una discusión registrada.

| Alternativa | Por qué se descartó |
| :--- | :--- |
| GitHub Actions con lint, unitarios y build † | No se configuró; el motivo no quedó registrado (el repositorio no tiene ninguna configuración de CI ni de despliegue). Es la adición más barata y de mayor valor |
| Hook pre-commit (Husky + lint-staged) † | No se configuró; no había más de una persona confirmando cambios |
| E2E en CI | Cada prueba **registra usuarios reales** en el proyecto de Supabase configurado; correrlas en CI exige un proyecto dedicado y credenciales, y el proyecto no lo definió |

## Consecuencias

- **A favor:** cero infraestructura y ningún paso oculto; el costo es cero mientras el equipo sea una persona.
- **En contra:** nada impide fusionar código que rompe los tests. **El estado de los e2e no está garantizado:** al escribir este ADR, `e2e/helpers.ts` registra usuarios con direcciones `@example.com`, que el registro público de Supabase rechazaba cuando se comprobó (registrado en [testing](../guides/testing.md); no se repitió la prueba), y `createDraft` pulsa un botón "Nuevo post" que ya no existe en la interfaz (la creación pasó al menú "Crear"/botón "+"). Además, `shell.spec.ts` espera una barra inferior de tres destinos (Inicio, Mis posts, Perfil) y un botón "Nuevo post", cuando hoy los destinos son cuatro (Inicio, Explorar, Actividad, Perfil) y el botón "+" abre una nota o el menú "Crear". Hasta que se corrijan, buena parte de los e2e no puede pasar aunque el código funcione; no se ejecutaron al escribir esta documentación, así que puede haber más desfases. Los tests unitarios sí son verificables sin nada más.
- **Cuándo revisar:** en cuanto haya una segunda persona o un remoto compartido. Orden sugerido: (1) Actions con `pnpm lint`, `pnpm test` y `pnpm build`; (2) arreglar los e2e y correrlos contra un proyecto de Supabase dedicado; (3) pruebas de migraciones cuando se adopte la CLI ([ADR 0016](0016-migraciones-sql-manuales.md)).
