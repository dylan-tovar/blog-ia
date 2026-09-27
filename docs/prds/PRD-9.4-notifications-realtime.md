# PRD-9.4 — Realtime para el badge de notificaciones

| Campo | Valor |
| :--- | :--- |
| Padre | [PRD-9 — Explorar, Actividad y opciones de post](PRD-9-explore-activity.md) |
| Dificultad | I (intermedia) |
| Esfuerzo | S (1 punto, menos de un día) |
| Dueño sugerido | D6 |
| Mentor | D2 (apoyo entre pares; escala a D1) |
| Depende de | [PRD-9.2](PRD-9.2-activity-nav.md) (`/activity` y `NAV_ITEMS`); tabla `notifications` de `supabase/migrations/0011_notifications.sql` |
| Código | `supabase/migrations/0015_notifications_realtime.sql`, `src/features/notifications/realtime/NotificationsRealtimeProvider.tsx`, `src/components/shared/NotificationBell.tsx`, `src/components/shared/AppShell.tsx` |
| ADRs | [0027](../adr/0027-notificaciones-por-triggers-sql.md), [0036](../adr/0036-notificaciones-realtime.md) |

## Resumen

El badge de notificaciones (el número rojo sobre la campana) se actualizaba solo por polling cada ~45s ([ADR 0027](../adr/0027-notificaciones-por-triggers-sql.md)). Ese mismo documento dejó escrita su propia cláusula de revisión: "si se necesita notificación instantánea, evaluar Realtime". Este paquete la ejecuta (issue #27), como primer uso de Supabase Realtime en el proyecto: cuando alguien te sigue, te da like o te deja una nota, el badge sube sin esperar el próximo tick de polling.

## Qué necesitás entender antes

- [ ] Qué es un **Client Component** con `useContext`/`useEffect`/`useRef` (ver [ADR 0036](../adr/0036-notificaciones-realtime.md)).
- [ ] Qué es un canal de **Supabase Realtime** (`postgres_changes`) y cómo depende de RLS para autorizar qué filas entrega.
- [ ] Por qué 3 componentes que se muestran en momentos distintos (`MainNav`, `DesktopSidebar`, `BottomNav`) pueden compartir **un solo** canal en vez de abrir tres.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| El canal Realtime y el contador del badge | La lista de `/activity` en vivo (`NotificationList.tsx` sigue igual, por `revalidatePath`) |
| Polling de 45s como fallback siempre activo | Políticas RLS nuevas (la existente ya alcanza) |
| Resincronizar el contador al reconectar | UI visible de estado de conexión ("reconectando…", etc.) |

## Cómo funciona

### Un solo canal, no tres

`NotificationsRealtimeProvider` (`src/features/notifications/realtime/NotificationsRealtimeProvider.tsx`) se monta una única vez en `AppShell`, envolviendo todo el árbol de la app. Resuelve su propio `userId` en el cliente (`supabase.auth.getUser()`) en vez de recibirlo como prop del servidor — así `AppShell` no necesita ningún `await` nuevo y el shell sigue streameando igual que antes. Expone `{ unreadCount }` vía Context, con el hook `useNotificationsRealtime()`. Las 3 instancias de `NotificationBell` (`MainNav`, `DesktopSidebar`, `BottomNav`) pasan a ser puramente presentacionales: ya no tienen su propio `useState`/`useEffect`/`matchMedia`, solo leen el contexto.

### El canal

Nombre determinístico `notifications:${userId}` (evita duplicados fantasma en React Strict Mode), suscripto a `postgres_changes` (`INSERT`/`UPDATE`) sobre `public.notifications` filtrado por `recipient_id=eq.${userId}`. Habilitarlo requirió sumar la tabla a la publicación `supabase_realtime` (`supabase/migrations/0015_notifications_realtime.sql`) — la autorización sigue siendo la política `notifications_select_own` existente, sin cambios de RLS.

### El contador

- `INSERT` con `read_at = null` → `+1` local.
- `UPDATE` que pasa de `read_at = null` a no-null → `-1` local.
- Reconexión real (tras `CLOSED`/`CHANNEL_ERROR`/`TIMED_OUT`) → una llamada a `getUnreadCount()` para corregir drift de eventos perdidos.
- Polling de 45s **siempre activo**, no gateado por el estado del canal: asignación directa del valor fresco, idempotente, autocorrige cualquier drift.

## Criterios de aceptación

- [ ] Un usuario autenticado abre una suscripción Realtime propia (no una por cada instancia visual del badge).
- [ ] El badge se actualiza sin esperar el próximo tick de polling cuando llega un evento real (follow, like o nota).
- [ ] Si la conexión Realtime se cae, el badge sigue actualizándose por el polling de 45s sin intervención.
- [ ] Un error de canal (`CHANNEL_ERROR`/`TIMED_OUT`) queda registrado (`console.warn`) y no rompe la UI ni deja el badge congelado.

## Fuera de alcance

- Vivir en la lista de `/activity`: el payload de `postgres_changes` no trae el embed de `actor` que la lista necesita (ver [ADR 0036](../adr/0036-notificaciones-realtime.md), alternativas descartadas).

## Diseño técnico

Ver [ADR 0036](../adr/0036-notificaciones-realtime.md) para las decisiones y alternativas descartadas (3 canales, re-consultar en cada evento, gatear el polling por estado de conexión, ampliar a `/activity`).

## Plan de pruebas

Verificación manual end-to-end (no hay entorno de test para WebSockets de Supabase en este proyecto):

1. Iniciar sesión con dos cuentas en dos navegadores (A y B). A sigue a B, o le da like/nota a un post de B.
2. En la sesión de B, comprobar que el badge sube dentro de 1-2 segundos, sin esperar 45s.
3. Simular una caída de red en la sesión de B (DevTools → Network → Offline unos segundos, luego Online). Comprobar en la consola el `console.warn` de `[notifications-realtime] channel error` y que, al volver la conexión, el badge se resincroniza (ya sea por la reconexión del canal o por el siguiente tick de polling).
4. Confirmar que las 3 ubicaciones del badge (barra superior desktop, sidebar desktop, barra inferior mobile) muestran siempre el mismo número al mismo tiempo.
5. Entrar a `/activity`: el badge baja a 0 (comportamiento preexistente de `markAllNotificationsRead()`, sin cambios en este paquete).
