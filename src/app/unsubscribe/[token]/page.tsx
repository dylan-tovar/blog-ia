import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";

// No login required on purpose: this is a one-click link from an email
// client. It's a GET that mutates — a deliberate trade-off (see ADR-0028):
// the only thing a leaked/guessed token can do is flip this one preference.
export default async function UnsubscribePage(props: PageProps<"/unsubscribe/[token]">) {
  const { token } = await props.params;

  const { data, error } = await createAdminClient()
    .from("profiles")
    .update({ notify_new_article_email: false })
    .eq("unsubscribe_token", token)
    .select("id")
    .maybeSingle();

  const ok = !error && data !== null;

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{ok ? "Listo" : "Enlace inválido"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {ok
              ? "No vas a recibir más correos de nuevos artículos. Podés seguir viendo la actividad dentro de la app."
              : "Este enlace ya no es válido."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
