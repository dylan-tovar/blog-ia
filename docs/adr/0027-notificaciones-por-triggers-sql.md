# 0027. Notificaciones generadas por triggers SQL, sin Realtime

- **Estado:** Aceptada.
- **Fecha:** 2026-09-21
- **Fuentes:** `supabase/migrations/0011_notifications.sql`, `supabase/migrations/0007_ai_features.sql` (`posts_invalidate_ai_cache`, patrón de trigger reusado), [ADR 0003](0003-seguridad-rls-y-proxy-minimo.md), [ADR 0026](0026-feed-de-seguidos-con-recomendados.md); `src/features/notifications/`, `src/features/subscriptions/actions.ts`, `src/features/likes/actions.ts`, `src/features/posts/actions.ts` (`createNote`, `deleteNote`).

## Contexto

Un usuario no tenía forma de enterarse cuando alguien lo seguía, le daba like a un post o le dejaba una nota. La ruta `/activity`, el ítem de navegación y el ícono `Bell` ya existían como placeholder desde el trabajo de feed/recomendaciones ([ADR 0026](0026-feed-de-seguidos-con-recomendados.md)), pero no había tabla, query ni acción detrás.

## Decisión

- **Tabla `notifications`** (`recipient_id`, `actor_id`, `type` en `'follow'|'like'|'note'`, `post_id`, `note_id`, `read_at`, `created_at`), con RLS como única autorización: `select`/`update` limitados a `recipient_id = auth.uid()`, **sin** políticas de `insert`/`delete` para `authenticated`/`anon`.
- **Se generan con triggers `SECURITY DEFINER`** sobre `subscriptions`, `likes` y `posts` (`notify_on_follow`/`notify_on_unfollow`/`notify_on_like`/`notify_on_unlike`/`notify_on_note`), no desde las Server Actions existentes. Mismo patrón que `posts_invalidate_ai_cache` de `0007_ai_features.sql`: la lógica vive en la base, así que cubre cualquier origen de escritura futuro sobre esas tablas (un script, una herramienta de admin), no solo las tres acciones de hoy.
- **Unfollow y unlike borran su notificación** correspondiente (triggers `AFTER DELETE`), para no dejar notificaciones stale de una acción ya deshecha. Borrar una nota (`deleteNote`) borra su notificación sola, por el `on delete cascade` de `note_id` — no hace falta un sexto trigger.
- **El badge de no leídas se actualiza por polling liviano en cliente** (`getUnreadCount`, cada ~45s) más `revalidatePath("/activity")` en las acciones que la tocan. No se introduce Supabase Realtime: el proyecto no lo usa en ningún lado hoy y el volumen esperado no lo justifica.
- **Marcar como leído es automático al entrar a `/activity`** (patrón Instagram/Twitter): la página lee las notificaciones con su `read_at` previo (para distinguir visualmente qué era nuevo) y recién después llama `markAllNotificationsRead()`, así el badge baja a 0 de inmediato. Sin botón manual en el MVP.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| Insertar la notificación desde cada Server Action (`followAuthor`, `setLike`, `createNote`) | Duplica la lógica en tres lugares y no cubre otro origen de escritura sobre esas tablas |
| Un solo trigger genérico por `TG_TABLE_NAME`/`TG_OP` | Menos DRY pero rompe la convención del repo de funciones chicas con un solo propósito (`can_attach_note`, `posts_invalidate_ai_cache`); además complica el `WHEN` de notas |
| Supabase Realtime para el badge | Patrón nuevo sin uso previo en el proyecto; `revalidatePath` + polling ya alcanzan al volumen esperado |
| `unique(recipient_id, actor_id, post_id, type)` en `notifications` | Un like → unlike → like del mismo post son dos eventos reales; agrupar/deduplicar perdería la segunda notificación |
| Botón explícito "marcar todo como leído" | Redundante: ya se marca automáticamente al entrar a `/activity` |

## Consecuencias

- **A favor:** RLS sigue siendo la única autorización real; los triggers cubren cualquier origen de escritura, no solo las Server Actions; sin dependencia nueva de infraestructura (Realtime); el patrón de paginación y "Cargar más" se reusa tal cual del feed.
- **En contra:** la lógica de negocio de "cuándo notificar" vive en SQL, no en TypeScript — hay que mirar la migración para entenderla; el badge tiene hasta ~45s de latencia frente a un evento real; cada like/unlike/follow/unfollow dispara un trigger extra en su transacción.
- **Cuándo revisar:** si se necesita notificación instantánea (latencia menor al intervalo de polling), evaluar Realtime; si el volumen de notificaciones por usuario crece mucho, evaluar agrupar (`"Ana y 3 más te siguieron"`) en vez de una fila por evento.
