import { createAdminClient } from "@/lib/supabase/admin";

export async function findEmailByUsername(username: string) {
  const { data, error } = await createAdminClient().rpc(
    "login_email_for_username",
    { p_username: username },
  );

  if (error) {
    throw new Error(`No pudimos resolver el usuario: ${error.message}`);
  }

  return data;
}
