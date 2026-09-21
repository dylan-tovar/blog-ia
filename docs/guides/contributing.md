# Cómo agregar una feature

Checklist para sumar una capacidad nueva sin romper las convenciones del proyecto. Cada paso enlaza a la decisión que lo explica. El ejemplo de referencia más corto es la feature `likes` (`src/features/likes/`).

## Antes de empezar

1. Leer el PRD de la zona que se toca ([índice de PRDs](../prds/README.md)) y los [ADRs](../adr/README.md) relacionados. Si el cambio contradice una decisión, hace falta un ADR nuevo, no una edición del viejo.
2. Leer [`AGENTS.md`](../../AGENTS.md): esta versión de Next.js tiene cambios respecto a lo conocido (`proxy.ts`, tipos `PageProps`), y la documentación vigente está en `node_modules/next/dist/docs/`.
3. Tener el proyecto corriendo con datos de prueba ([getting-started](getting-started.md)).

## Del dato a la pantalla

| Paso | Qué hacer | Convención | Ejemplo |
| :--- | :--- | :--- | :--- |
| 1. Base de datos | Si hay tabla o columna nueva, una migración `000N_nombre.sql` con **RLS y privilegios en el mismo archivo**. Escribirla re-ejecutable por sí sola cuando se pueda (si redefine una política que otra migración también toca, dejar dicho que solo se repite en cadena, como `0005` a `0007`). Actualizar `database.types.ts` a mano | [ADR 0003](../adr/0003-seguridad-rls-y-proxy-minimo.md), [0012](../adr/0012-integridad-de-escritura-de-posts.md), [0016](../adr/0016-migraciones-sql-manuales.md) | `supabase/migrations/0005_post_types_and_likes.sql` |
| 2. Esquema | Un schema Zod para cada entrada en `schemas.ts` del dominio. Test primero (`schemas.test.ts`) | Se prueba el mensaje de error, porque es texto visible | `likes/schemas.ts` |
| 3. Escritura | Una Server Action en `actions.ts`: `safeParse`, `requireUser()`, la escritura con el cliente del usuario (RLS decide), `revalidatePath`. Devuelve `{ ok }` o `{ error }`, nunca el error crudo de Supabase | [ADR 0001](../adr/0001-monolito-nextjs-sin-capas.md) | `likes/actions.ts` |
| 4. Lectura | Una función en `queries.ts` que usa `createClient()` de `lib/supabase/server.ts`; un id inválido termina en `notFound()` | | `posts/queries.ts` |
| 5. Componentes | En `components/` del dominio, `PascalCase`. Lo genérico va a `components/ui/` (`pnpm dlx shadcn@latest add`); lo transversal a `components/shared/` | [ADR 0005](../adr/0005-shadcn-ui-como-primitivas.md), [0006](../adr/0006-organizacion-por-dominio.md) | `likes/components/LikeButton.tsx` |
| 6. Ruta | Si es privada, protegerla con `PROTECTED_PATHS` en `proxy.ts`, con `getViewer()` en la página o con la comprobación del handler | [Grupos de ruta](../architecture/overview.md#grupos-de-ruta) | `(dashboard)/activity/page.tsx` |
| 7. Pruebas | Unitarios junto al archivo; e2e solo si cambia un flujo visible; `pnpm verify:writes` si toca escrituras de `posts` | [testing](testing.md) | |
| 8. Documentación | Actualizar el PRD de la feature (o crear uno), el ADR si hay una decisión nueva, y `db/schema.md` si cambia el esquema | Ver más abajo | |

## Convenciones del código

| Tema | Regla |
| :--- | :--- |
| Idioma | Texto visible y mensajes de error en español; identificadores y comentarios en inglés |
| Estructura | Un dominio por carpeta en `src/features/<dominio>/`, plano hasta que el tamaño pida subdividir ([ADR 0006](../adr/0006-organizacion-por-dominio.md)) |
| Validación | Zod al entrar (formularios, cuerpos de Route Handlers) y a la salida de la IA ([ADR 0011](../adr/0011-ia-con-gemini.md)) |
| Código solo de servidor | Importar `server-only`; el cliente admin (`lib/supabase/admin.ts`) **salta RLS** y nunca se importa desde un componente cliente |
| Errores | Al usuario, un mensaje legible; al log, solo metadatos (nunca el contenido de un post ni claves) |
| Tests | Junto al archivo, `*.test.ts`, entorno `node`; sin DOM ([testing](testing.md)) |
| Componentes con Tiptap | Lo que necesita ProseMirror real se prueba con Playwright, no con Vitest |

## Si la feature usa IA

Seguir la [guía de la capa de IA](../ai/overview.md#cómo-agregar-una-función-de-ia-nueva): tipo de función, configuración, esquema, prompt, handler con límite por minuto, qué pasa si falla, interfaz y documentación.

## Documentar

| Qué cambió | Dónde queda escrito |
| :--- | :--- |
| El comportamiento visible o el alcance | El PRD de la feature; si no existe, crear `docs/prds/PRD-N.md` con la misma estructura que los demás y sumarlo al índice |
| Una decisión de arquitectura (con alternativas) | Un ADR nuevo con la plantilla [`0000-template.md`](../adr/0000-template.md); si reemplaza a otro, marcar el anterior |
| El código cambió pero la decisión sigue | Una sección `## Actualización` al final del ADR afectado |
| Tablas, políticas o funciones | [`db/schema.md`](../db/schema.md) |
| Rutas, carpetas o flujos | [`architecture/overview.md`](../architecture/overview.md) |
| Algo que queda pendiente | La sección de limitaciones conocidas del PRD y la tabla de pendientes de la arquitectura |

## Checklist final

- [ ] `pnpm lint` y `pnpm test` pasan.
- [ ] Si se tocó la base: la migración es re-ejecutable por sí sola (o dice que no lo es y en qué cadena se repite) y `database.types.ts` está al día.
- [ ] Si se tocaron escrituras de `posts`: `pnpm verify:writes` pasa.
- [ ] La documentación afectada está actualizada (PRD, ADR, esquema, arquitectura).
- [ ] Ningún secreto (`SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`) llegó al código, a un log ni al navegador.
