"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getUnreadCount } from "@/features/notifications/actions";
import type { Database } from "@/lib/supabase/database.types";

type NotificationChangeRow = Database["public"]["Tables"]["notifications"]["Row"];

// Sigue activo SIEMPRE como fallback (no gateado por el estado del canal):
// es idempotente (asignación directa del valor fresco, no una suma), así
// que autocorrige cualquier drift sin duplicar lo que ya aplicó Realtime.
const POLL_INTERVAL_MS = 45_000;

type NotificationsRealtimeContextValue = {
  unreadCount: number;
};

const NotificationsRealtimeContext = createContext<NotificationsRealtimeContextValue | null>(
  null,
);

export function useNotificationsRealtime(): NotificationsRealtimeContextValue {
  const context = useContext(NotificationsRealtimeContext);
  if (!context) {
    throw new Error(
      "useNotificationsRealtime debe usarse dentro de un NotificationsRealtimeProvider",
    );
  }
  return context;
}

// Resuelve su propio userId en el cliente (vía la sesión ya presente en las
// cookies) en vez de recibirlo como prop resuelta en el servidor: así
// AppShell no necesita awaitear nada para montar este provider, y el shell
// sigue streameando de inmediato como antes de este cambio.
export function NotificationsRealtimeProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [, startTransition] = useTransition();
  // Cuenta cuántos eventos INSERT/UPDATE se aplicaron: usado para detectar si
  // un poll en vuelo quedó desactualizado por un evento que llegó mientras
  // esperaba la respuesta (ver comentario en resyncUnreadCount).
  const eventVersionRef = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setUserId(data.user?.id ?? null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const supabase = createClient();

    function resyncUnreadCount() {
      const versionAtRequest = eventVersionRef.current;
      startTransition(async () => {
        const fresh = await getUnreadCount();
        // Si llegó un evento Realtime mientras esta consulta estaba en
        // vuelo, el valor local ya es más nuevo que este snapshot — no lo
        // pisemos con un dato desactualizado; el próximo tick/resync
        // converge igual.
        if (eventVersionRef.current === versionAtRequest) {
          setCount(fresh);
        }
      });
    }

    // Primer valor real: no depende de lo que haya (o no) resuelto el
    // servidor, así que no hace falta que AppShell awaitee nada por esto.
    resyncUnreadCount();

    // Nombre determinístico (`notifications:${userId}`) en vez de un id
    // aleatorio: evita canales duplicados fantasma cuando React Strict Mode
    // monta/desmonta el efecto dos veces en desarrollo.
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on<NotificationChangeRow>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          eventVersionRef.current += 1;
          if (payload.new.read_at === null) {
            setCount((current) => current + 1);
          }
        },
      )
      .on<NotificationChangeRow>(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          eventVersionRef.current += 1;
          if (payload.old.read_at === null && payload.new.read_at !== null) {
            setCount((current) => Math.max(0, current - 1));
          }
        },
      )
      .subscribe((status) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          // Siempre resincroniza al (re)conectar, no solo en reconexiones:
          // también cierra el hueco real entre el mount de este efecto y el
          // momento en que el canal queda SUBSCRIBED, donde un evento pudo
          // haber ocurrido sin que este cliente lo escuchara.
          resyncUnreadCount();
          return;
        }

        if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
          status === REALTIME_SUBSCRIBE_STATES.CLOSED
        ) {
          // Autorrecuperable: el polling de abajo sigue corriendo igual, y
          // Realtime reintenta la conexión solo. No es un console.error.
          console.warn("[notifications-realtime] channel error", { userId, status });
        }
      });

    const interval = setInterval(resyncUnreadCount, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <NotificationsRealtimeContext.Provider value={{ unreadCount: count }}>
      {children}
    </NotificationsRealtimeContext.Provider>
  );
}
