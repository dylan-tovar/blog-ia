import { createClient } from "@/lib/supabase/server";
import { excerpt } from "@/features/posts/utils";
import type { NotificationType } from "@/lib/supabase/database.types";

const ACTOR_EMBED = "actor:profiles(id, display_name)";
const NOTE_EXCERPT_MAX_LENGTH = 140;

export const NOTIFICATIONS_PAGE_SIZE = 20;

export type Notification = {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  actor: { id: string; displayName: string } | null;
  // 'like': post likeado. 'note': post padre (para navegar al hilo). 'follow': null.
  postId: string | null;
  // Solo 'note': primeras líneas de la nota dejada.
  noteExcerpt: string | null;
};

type NotificationRow = {
  id: string;
  type: NotificationType;
  post_id: string | null;
  note_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: { id: string; display_name: string } | null;
};

async function getNoteExcerpts(noteIds: string[]) {
  const ids = [...new Set(noteIds)];
  const excerpts = new Map<string, string>();
  if (ids.length === 0) {
    return excerpts;
  }

  // Una nota borrada simplemente no vuelve: la notificación pierde el excerpt
  // sin romper el resto de la lista (además, borrar la nota borra la
  // notificación misma por el `on delete cascade` de `note_id`).
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts").select("id, content").in("id", ids);

  if (error) {
    throw new Error(`No pudimos cargar las notas: ${error.message}`);
  }

  for (const row of data ?? []) {
    excerpts.set(row.id, excerpt(row.content, NOTE_EXCERPT_MAX_LENGTH));
  }
  return excerpts;
}

function toNotification(row: NotificationRow, noteExcerpts: Map<string, string>): Notification {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    readAt: row.read_at,
    actor: row.actor ? { id: row.actor.id, displayName: row.actor.display_name } : null,
    postId: row.post_id,
    noteExcerpt: row.note_id ? (noteExcerpts.get(row.note_id) ?? null) : null,
  };
}

export async function getNotificationsPage(userId: string, offset = 0) {
  const supabase = await createClient();
  // `.eq("recipient_id", userId)` explícito aunque RLS ya lo garantiza: mismo
  // criterio que `subscriptions/queries.ts` y `likes/queries.ts` (defensa en
  // profundidad + índice usable).
  const { data, error } = await supabase
    .from("notifications")
    .select(`id, type, post_id, note_id, read_at, created_at, ${ACTOR_EMBED}`)
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + NOTIFICATIONS_PAGE_SIZE);

  if (error) {
    throw new Error(`No pudimos cargar las notificaciones: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as NotificationRow[];
  const pageRows = rows.slice(0, NOTIFICATIONS_PAGE_SIZE);
  const noteExcerpts = await getNoteExcerpts(
    pageRows.flatMap((row) => (row.note_id ? [row.note_id] : [])),
  );

  return {
    notifications: pageRows.map((row) => toNotification(row, noteExcerpts)),
    hasMore: rows.length > NOTIFICATIONS_PAGE_SIZE,
  };
}

export async function getUnreadNotificationCount(userId: string) {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) {
    throw new Error(`No pudimos contar las notificaciones: ${error.message}`);
  }

  return count ?? 0;
}
