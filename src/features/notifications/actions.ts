"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { notificationsQuerySchema } from "@/features/notifications/schemas";
import {
  getNotificationsPage,
  getUnreadNotificationCount,
} from "@/features/notifications/queries";

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", user.id)
    .is("read_at", null);

  revalidatePath("/activity");
  return { ok: !error };
}

export async function loadMoreNotifications(offset: number) {
  const parsed = notificationsQuerySchema.safeParse({ offset });
  if (!parsed.success) {
    return { notifications: [], hasMore: false };
  }

  const { user } = await requireUser();
  return getNotificationsPage(user.id, parsed.data.offset);
}

// Sin `requireUser()`: el polling del badge corre en background y no debe forzar
// un redirect a /login si la sesión expiró (mismo criterio que `recordRead`).
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return 0;
  }

  return getUnreadNotificationCount(user.id);
}
