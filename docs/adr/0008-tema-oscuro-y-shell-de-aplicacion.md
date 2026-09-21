# 0008. Tema solo oscuro con azul y shell de aplicación mobile-first

- **Estado:** Aceptada
- **Fecha:** 2026-09-19
- **Fuentes:** `src/app/globals.css`, `src/components/shared/AppShell.tsx`, [PRD-0](../prds/PRD-0-design-system.md) secciones 4 y 5

## Contexto

La interfaz debía parecerse a la app móvil de Substack: modo oscuro, barra superior con título y avatar, feed de items planos, navegación inferior y botón flotante para crear. PRD-0 definía un tema claro y descartaba el modo oscuro.

## Decisión

La app tiene **un solo tema, oscuro**, con el **azul** (`blue-600`) como color primario. `<html class="dark">` mantiene activas las variantes `dark:` de shadcn y los tokens viven en `:root`. Un `AppShell` (`components/shared/`) envuelve `(public)` y `(dashboard)`: barra superior con título por ruta y avatar, barra inferior (Inicio, Mis posts, Perfil) y botón "+" solo con sesión y solo en mobile; desde `md:` la navegación pasa a la barra superior. `login` y `register` quedan en `(auth)`, sin shell. Solo se muestra lo que existe: no hay likes, comentarios, inbox ni búsqueda.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Tema claro y oscuro según el sistema | Duplica el diseño y las pruebas visuales sin que el producto lo pida |
| Acento naranja como en la captura | Se pidió conservar el azul de PRD-0 |
| Copiar likes, comentarios e inbox | No existen en los PRDs: serían botones sin función |
| Un layout por grupo sin componente compartido | Duplica header y navegación en dos archivos |

## Consecuencias

- **A favor:** interfaz consistente, un solo juego de tokens, navegación de una mano en mobile, el shell no bloquea el render (sesión detrás de `<Suspense>`).
- **En contra:** los links azules necesitan `blue-400` para contraste; agregar un tema claro después implica revisar cada componente; un layout no se re-renderiza al navegar dentro de su grupo, así que el avatar solo se refresca al cargar el layout.
- **Cuándo revisar:** si se pide modo claro, o si aparecen funciones (comentarios, notificaciones, búsqueda) que justifiquen más destinos en la navegación.

## Actualización (2026-09-20)

Lo que la decisión llamaba "no existe todavía" cambió, sin alterar la decisión de tema y shell:

- **Likes y notas existen** ([ADR 0009](0009-tipos-de-post-y-likes.md)); siguen sin existir comentarios, inbox y búsqueda.
- **La navegación tiene cuatro destinos** (`src/components/shared/navigation.ts`): Inicio, Explorar, Actividad y Perfil. "Mis posts" (`/posts`) ya no está en la barra; sigue existiendo como ruta. `/explore` muestra el feed con filtro de tags ([ADR 0020](0020-tags-como-metadato-interno.md)) y `/activity` es hoy una pantalla vacía ([PRD-9](../prds/PRD-9-explore-activity.md)).
- **El botón "+" también está en escritorio:** en móvil abre el diálogo de nota directamente y desde `md` abre el menú "Crear" (Nota o Artículo) (`NewPostButton`).
