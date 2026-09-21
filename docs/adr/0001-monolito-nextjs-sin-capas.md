# 0001. Monolito Next.js con Server Actions directas

- **Estado:** Aceptada
- **Fuentes:** [PRD-global](../PRD-global-vision.md) secciones 3 y 15; `src/features/*/actions.ts`

## Contexto

El proyecto es una aplicación de un solo equipo y alcance acotado. Separar un backend propio o simular capas formales agregaría archivos sin lógica intermedia real.

## Decisión

Next.js (App Router) más Supabase, sin backend separado. Una Server Action valida el input con Zod y llama directo a Supabase. No existen las capas Controller, Service ni Repository.

En el código: `src/features/auth/actions.ts`, `posts/actions.ts` y `profile/actions.ts` usan `createClient()` de `src/lib/supabase/server.ts` sin intermediarios. Las lecturas viven en `queries.ts` como funciones planas, no como repositorios.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Controller / Service / Repository en tres carpetas | Pasa objetos de una capa a otra sin lógica propia; más código sin beneficio de mantenibilidad a esta escala |
| Backend separado (API REST propia) | Duplica lo que Supabase (Auth, RLS, PostgREST) y las Server Actions ya resuelven |

## Consecuencias

- **A favor:** menos archivos, flujo de una petición fácil de seguir.
- **En contra:** la lógica de negocio queda en las actions; si crece y se repite entre features habrá que extraerla.
- **Cuándo revisar:** si aparece lógica compartida entre varias actions o un segundo cliente (móvil, API pública) que consuma el backend.

## Actualización (2026-09-20)

La decisión se mantiene (monolito, sin capas Controller/Service/Repository). La excepción son las funciones de IA, que además de Server Actions (`publishPost`, resumen) usan **Route Handlers** en `src/app/api/ai/*` porque una Server Action bloquearía el autosave y no puede hacer streaming de eventos tipados ([ADR 0011](0011-ia-con-gemini.md), [ADR 0013](0013-chat-ia-protocolo-ndjson-y-function-calling.md)). Para separar la lógica pura de la que depende de Supabase o del SDK, la capa de IA suele usar el sufijo `.server.ts` (con `import "server-only"`) para lo que toca Supabase o secretos (`gemini.ts` también es `server-only` sin el sufijo) y deja sin sufijo lo puro y probable con Vitest.
