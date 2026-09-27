# 0036. Supabase Realtime para el badge de notificaciones

- **Estado:** Aceptada.
- **Fecha:** 2026-09-26
- **Fuentes:** `supabase/migrations/0015_notifications_realtime.sql`, [ADR 0027](0027-notificaciones-por-triggers-sql.md); `src/features/notifications/realtime/NotificationsRealtimeProvider.tsx`.

## Contexto

[ADR 0027](0027-notificaciones-por-triggers-sql.md) decidió deliberadamente no usar Supabase Realtime para el badge de notificaciones: el proyecto no lo usaba en ningún lado y el volumen esperado no lo justificaba, así que el badge se actualizaba por polling liviano (`getUnreadCount()` cada ~45s), instanciado 3 veces (`MainNav`, `DesktopSidebar`, `BottomNav`, siempre montadas simultáneamente y ocultas por CSS según breakpoint) con un `matchMedia` distinto cada una para que solo una hiciera polling a la vez. Esa misma ADR dejó escrita su propia cláusula de revisión: "si se necesita notificación instantánea (latencia menor al intervalo de polling), evaluar Realtime". Este documento ejecuta esa revisión (issue #27) como ejercicio de aprendizaje — no hay una urgencia de negocio detrás, es la primera vez que el proyecto usa Supabase Realtime.

## Decisión

- **Un solo canal Realtime por usuario**, no uno por instancia de `NotificationBell`. `NotificationsRealtimeProvider` (Client Component, `src/features/notifications/realtime/NotificationsRealtimeProvider.tsx`) se monta una única vez en `AppShell` y expone el contador vía Context (`useNotificationsRealtime()`); las 3 instancias de `NotificationBell` pasan a ser presentacionales y solo leen ese contexto.
- El canal se llama `notifications:${userId}` (nombre determinístico, no un id aleatorio) para no abrir un canal fantasma duplicado cuando React Strict Mode monta el efecto dos veces en desarrollo.
- Se suscribe a `postgres_changes` (`INSERT`/`UPDATE`) sobre `public.notifications` filtrado por `recipient_id=eq.${userId}`. Habilitarlo requiere sumar la tabla a la publicación `supabase_realtime` **y** poner `replica identity full` en la tabla (migración `0015_notifications_realtime.sql`, idempotente): con la replica identity default, el payload de `UPDATE` solo trae la primary key en `old`, y el cliente necesita `old.read_at` para distinguir "pasó de no-leída a leída" de cualquier otro `UPDATE`. **La RLS existente (`notifications_select_own`) sigue siendo la única autorización** — un canal Realtime solo entrega al cliente las filas que su JWT ya podría leer vía `select`, así que no se agrega ninguna policy nueva.
- Un `INSERT` con `read_at = null` incrementa el contador local en 1; un `UPDATE` que pasa de `read_at = null` a no-null lo decrementa en 1. No se vuelve a consultar `getUnreadCount()` en cada evento: el evento mismo ya trae la información necesaria para actualizar el contador de forma incremental.
- El Provider **resuelve su propio `userId` en el cliente** (`supabase.auth.getUser()`, que lee la sesión ya presente en cookies) en vez de recibirlo como prop resuelta en el servidor. Esto es deliberado: `AppShell` sigue siendo una función síncrona, sin ningún `await` nuevo, para no bloquear el streaming del resto del shell (`{children}`, el feed) — ver "Alternativas consideradas".
- El **polling de 45s (`POLL_INTERVAL_MS`) sigue SIEMPRE activo**, sin importar el estado del canal. Cada tick reemplaza el contador por el valor fresco, pero solo si no llegó ningún evento Realtime mientras la consulta estaba en vuelo (se compara contra un contador de eventos aplicados, capturado al iniciar el poll) — así un evento más nuevo que llegó durante el round-trip del poll nunca es pisado por una respuesta ya desactualizada.
- Se resincroniza (`getUnreadCount()`) cada vez que el canal llega a `SUBSCRIBED`, no solo en reconexiones tras una caída: también cierra el hueco real entre que el efecto monta y el canal queda suscripto, ventana en la que un evento pudo ocurrir sin que este cliente lo escuchara.
- **Sin UI visible de estado de conexión**: no se expone ningún `connectionStatus` en el contexto — `NotificationBell` solo necesita `unreadCount`, así que no hay estado sin consumidor colgando de la firma pública. Un error de canal (`CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`) es autorrecuperable (Realtime reintenta solo, y el polling sigue corriendo) y solo deja un `console.warn`, no un `console.error`.
- **Alcance limitado al badge**: la lista de `/activity` (`NotificationList.tsx`) sigue actualizándose como hoy, por `revalidatePath` al navegar. No se conecta a Realtime en este cambio.

## Alternativas consideradas

| Alternativa | Por qué se descartó |
| :--- | :--- |
| 3 canales, uno por instancia de `NotificationBell` | Sockets redundantes: las 3 instancias representan al mismo usuario viendo la misma cuenta, no hace falta triplicar la conexión |
| Re-consultar `getUnreadCount()` en cada evento de Realtime | El payload del evento ya trae `read_at`, que es todo lo que hace falta para saber si suma o resta; volver a pegarle a la base en cada evento es costo y latencia innecesarios |
| Gatear el polling según el estado de conexión (pausarlo mientras el canal está `subscribed`) | Condición de carrera al reconectar: si el canal cae justo después de pausar el polling, el badge queda sin ninguna vía de actualización hasta que el canal se recupere |
| Ampliar Realtime a la lista de `/activity` en vivo | Fuera de alcance del issue #27 (que pide el badge); además el payload de `postgres_changes` no trae el embed de `actor` que la lista necesita mostrar (`actor:profiles!notifications_actor_id_fkey(...)`), habría que resolverlo aparte por cada evento |
| Resolver `userId`/contador inicial en `AppShell` (servidor) y pasarlos como prop al Provider | Obliga a `AppShell` a ser `async` y a esperar esa consulta antes de devolver cualquier JSX; como nada envuelve `<AppShell>` en `Suspense`, eso bloquea el streaming de toda la ruta (incluido `{children}`, el feed), no solo del badge — regresión real detectada en code review antes de mergear |

## Consecuencias

- **A favor:** el badge se actualiza sin esperar hasta 45s en el caso normal; la RLS sigue siendo la única autorización real, sin políticas nuevas; el polling como fallback siempre activo elimina cualquier ventana en la que el badge dependa exclusivamente de una conexión WebSocket.
- **En contra:** primer uso de Supabase Realtime en el proyecto (nueva superficie a mantener: conexión WebSocket, reconexión, `REALTIME_SUBSCRIBE_STATES`); requiere la migración `0015` para sumar `notifications` a la publicación `supabase_realtime` (paso manual en el SQL Editor de Supabase, igual que las migraciones anteriores); cada sesión de un usuario autenticado abre una conexión WebSocket adicional.
- **Qué queda superado de [ADR 0027](0027-notificaciones-por-triggers-sql.md):** solo la frase "no se introduce Supabase Realtime... polling ya alcanza al volumen esperado". El resto de esa ADR se mantiene intacto y sin cambios: los triggers `SECURITY DEFINER` sobre `subscriptions`/`likes`/`posts` siguen siendo quienes escriben `notifications`; unfollow/unlike siguen borrando su notificación correspondiente; marcar como leído sigue siendo automático al entrar a `/activity`, sin botón manual.
- **Cuándo revisar:** si se decide extender Realtime a la lista de `/activity` en vivo, habrá que resolver cómo traer el embed de `actor` para cada evento entrante (una consulta puntual por notificación nueva, o aceptar mostrarla sin actor hasta el próximo refresh de la página).
