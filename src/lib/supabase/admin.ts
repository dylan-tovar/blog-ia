import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/database.types";

// Bypasses RLS. Never import this from a Client Component or return its
// results to the browser without filtering them first.
export function createAdminClient() {
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    getServerEnv().SUPABASE_SECRET_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
