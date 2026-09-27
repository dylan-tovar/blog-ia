import { createClient } from "@/lib/supabase/server";

export async function getRepostedPostIds(userId: string, postIds: string[]) {
  if (postIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reposts")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);

  if (error) {
    // Si la tabla aún no existe en Supabase (ej. migración pendiente), degradar graciosamente sin romper el feed
    if (error.code === "42P01" || error.code === "PGRST205" || error.message.includes("schema cache")) {
      console.warn("Tabla 'reposts' pendiente de migración en Supabase:", error.message);
      return [];
    }
    throw new Error(`No pudimos leer los reposts: ${error.message}`);
  }

  return (data ?? []).map((row) => row.post_id);
}

export async function getRepostCounts(postIds: string[]) {
  const ids = [...new Set(postIds)];
  const counts = new Map<string, number>();
  if (ids.length === 0) {
    return counts;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reposts")
    .select("post_id")
    .in("post_id", ids);

  if (error) {
    // Si la tabla aún no existe en Supabase, devolver contadores en 0
    if (error.code === "42P01" || error.code === "PGRST205" || error.message.includes("schema cache")) {
      console.warn("Tabla 'reposts' pendiente de migración en Supabase:", error.message);
      return counts;
    }
    throw new Error(`No pudimos contar las republicaciones: ${error.message}`);
  }

  for (const row of data ?? []) {
    counts.set(row.post_id, (counts.get(row.post_id) ?? 0) + 1);
  }
  return counts;
}

export async function getRepostsByUser(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reposts")
    .select("post_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205" || error.message.includes("schema cache")) {
      console.warn("Tabla 'reposts' pendiente de migración en Supabase:", error.message);
      return [];
    }
    throw new Error(`No pudimos leer las republicaciones del usuario: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    postId: row.post_id,
    repostedAt: row.created_at,
  }));
}



