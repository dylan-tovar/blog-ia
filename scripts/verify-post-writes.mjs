// Verifica la integridad de escritura de `posts` (migración 0007) como un usuario real de
// la app: con la anon key y sesión, exactamente lo que podría hacer alguien desde el
// navegador. Confirma que NO puede saltarse la moderación y que las rutas legítimas
// siguen funcionando. Limpia todo lo que crea.
// Uso: pnpm verify:writes   (requiere .env.local, `pnpm seed:dev` y la migración 0007 aplicadas)
// Si además está SUPABASE_SECRET_KEY, comprueba el trigger que invalida el caché de IA.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = createClient(url, key, options);
const admin = secret ? createClient(url, secret, options) : null;

const results = [];
function check(name, ok, detail = "") {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? `  -> ${detail}` : ""}`);
}

const signedIn = await client.auth.signInWithPassword({
  email: "mateo_ia.seed@blog-ia.test",
  password: "Seed-Password-123",
});
if (signedIn.error) {
  throw new Error(`No pude iniciar sesión como mateo_ia (¿corriste pnpm seed:dev?): ${signedIn.error.message}`);
}
const userId = signedIn.data.user.id;

const created = [];
const now = () => new Date().toISOString();
const insertPost = (row) => client.from("posts").insert({ author_id: userId, ...row }).select("id").single();

const published = await client
  .from("posts")
  .select("id, author_id")
  .eq("type", "article")
  .eq("status", "published")
  .neq("author_id", userId)
  .limit(1)
  .maybeSingle();
if (!published.data) {
  throw new Error("No hay un artículo publicado de otro usuario: corré pnpm seed:dev.");
}
const foreignArticleId = published.data.id;
const foreignAuthorId = published.data.author_id;
const anon = createClient(url, key, options);

// "Blocked" = the database refused (permission error) or RLS matched zero rows. Any other
// error (network, syntax) is NOT proof of protection and must fail the check.
const isBlocked = (res) => (res.error ? res.error.code === "42501" : (res.data?.length ?? 0) === 0);

try {
  // --- Escrituras legítimas ---
  const draft = await insertPost({ type: "article", title: "verify-writes", content: "borrador", status: "draft" });
  check("CAN insert a draft article", !draft.error && !!draft.data, draft.error?.message);
  if (!draft.data) throw new Error("sin borrador no se puede continuar");
  const draftId = draft.data.id;
  created.push(draftId);

  const edit = await client.from("posts").update({ title: "verify-writes 2", content: "contenido nuevo" }).eq("id", draftId).select("id");
  check("CAN update own title/content", !edit.error && edit.data?.length === 1, edit.error?.message);

  const note = await insertPost({ type: "note", content: "nota de verificación", status: "published", published_at: now() });
  check("CAN insert a published note", !note.error && !!note.data, note.error?.message);
  if (note.data) created.push(note.data.id);

  const reply = await insertPost({
    type: "note", content: "respuesta de verificación", status: "published", published_at: now(), parent_post_id: foreignArticleId,
  });
  check("CAN insert a note replying to a published article", !reply.error && !!reply.data, reply.error?.message);
  if (reply.data) created.push(reply.data.id);

  if (note.data) {
    const editNote = await client.from("posts").update({ content: "nota editada" }).eq("id", note.data.id).select("id");
    check("CAN edit own note content", !editNote.error && editNote.data?.length === 1, editNote.error?.message);
  }

  // --- Bypass de moderación: todo esto debe fallar ---
  const forcePublish = await client.from("posts").update({ status: "published" }).eq("id", draftId).select("id");
  check("CANNOT update status to 'published'", !!forcePublish.error, "la actualización fue aceptada");

  for (const patch of [
    { published_at: now() },
    { rejection_reason: "x" },
    { ai_generated_summary: "resumen falso" },
    { ai_generated_titles: ["falso"] },
    { content_score: { score: 100, suggestions: [], keywords: [] } },
    { type: "note" },
    { updated_at: now() },
    { author_id: foreignAuthorId },
  ]) {
    const [column] = Object.keys(patch);
    const attempt = await client.from("posts").update(patch).eq("id", draftId).select("id");
    check(`CANNOT update column '${column}'`, isBlocked(attempt), attempt.error?.message ?? "la actualización fue aceptada");
  }

  const insertPublished = await insertPost({ type: "article", title: "x", content: "y", status: "published", published_at: now() });
  check("CANNOT insert an article already published", !!insertPublished.error, "el insert fue aceptado");
  if (insertPublished.data) created.push(insertPublished.data.id);

  const insertWithAi = await insertPost({ type: "article", title: "x", content: "y", status: "draft", ai_generated_summary: "falso" });
  check("CANNOT insert with ai_generated_summary", !!insertWithAi.error, "el insert fue aceptado");
  if (insertWithAi.data) created.push(insertWithAi.data.id);

  // --- PostgREST upsert (INSERT ... ON CONFLICT DO UPDATE) también necesita privilegios ---
  const upsertOwn = await client
    .from("posts")
    .upsert({ id: draftId, author_id: userId, type: "article", title: "x", content: "y", status: "published", published_at: now() }, { onConflict: "id" })
    .select("id");
  check("CANNOT upsert an own row into 'published'", isBlocked(upsertOwn), upsertOwn.error?.message ?? "el upsert fue aceptado");

  const freshId = crypto.randomUUID();
  const upsertNew = await client
    .from("posts")
    .upsert({ id: freshId, author_id: userId, type: "article", title: "x", content: "y", status: "published", published_at: now() }, { onConflict: "id" })
    .select("id");
  check("CANNOT upsert a brand-new row as published", isBlocked(upsertNew), upsertNew.error?.message ?? "el upsert fue aceptado");
  if (upsertNew.data?.length) created.push(freshId);

  // --- El limitador y sus contadores no son accesibles desde el navegador ---
  for (const [label, who] of [["authenticated", client], ["anon", anon]]) {
    const rpc = await who.rpc("ai_rate_limit_hit", { p_user_key: "verify", p_user_limit: 1, p_global_limit: 1 });
    check(`CANNOT call ai_rate_limit_hit as ${label}`, !!rpc.error, "la función fue ejecutada");

    const counters = await who.from("ai_rate_limits").select("key");
    check(`CANNOT read ai_rate_limits as ${label}`, !!counters.error || (counters.data?.length ?? 0) === 0, "se leyeron contadores");
  }

  // --- Notas adjuntas: reglas de padre ---
  const onDraft = await insertPost({ type: "note", content: "sobre un borrador", status: "published", published_at: now(), parent_post_id: draftId });
  check("CANNOT attach a note to a draft", !!onDraft.error, "el insert fue aceptado");
  if (onDraft.data) created.push(onDraft.data.id);

  if (reply.data) {
    const nested = await insertPost({ type: "note", content: "respuesta a respuesta", status: "published", published_at: now(), parent_post_id: reply.data.id });
    check("CANNOT reply to a reply (no nested threads)", !!nested.error, "el insert fue aceptado");
    if (nested.data) created.push(nested.data.id);
  }

  const articleWithParent = await insertPost({ type: "article", title: "x", content: "y", status: "draft", parent_post_id: foreignArticleId });
  check("CANNOT create an article with a parent", !!articleWithParent.error, "el insert fue aceptado");
  if (articleWithParent.data) created.push(articleWithParent.data.id);

  // --- Posts ajenos ---
  const foreignEdit = await client.from("posts").update({ title: "hackeado" }).eq("id", foreignArticleId).select("id");
  check("CANNOT edit another user's post", !foreignEdit.error && (foreignEdit.data?.length ?? 0) === 0, foreignEdit.error?.message ?? "se modificó una fila ajena");

  const foreignDelete = await client.from("posts").delete().eq("id", foreignArticleId).select("id");
  check("CANNOT delete another user's post", isBlocked(foreignDelete), foreignDelete.error?.message ?? "se borró una fila ajena");

  // --- Trigger de invalidación del caché (solo con la secret key) ---
  if (admin) {
    await admin.from("posts").update({ ai_generated_summary: "resumen", ai_generated_titles: ["a", "b", "c"] }).eq("id", draftId);
    await client.from("posts").update({ content: "otro contenido distinto" }).eq("id", draftId);
    const after = await admin.from("posts").select("ai_generated_summary, ai_generated_titles, content_score, updated_at").eq("id", draftId).single();
    check(
      "Trigger clears the AI cache when content changes",
      after.data?.ai_generated_summary === null && after.data?.ai_generated_titles === null && after.data?.content_score === null,
      JSON.stringify(after.data),
    );

    const before = after.data?.updated_at;
    await client.from("posts").update({ title: "solo cambia el título" }).eq("id", draftId);
    const titleOnly = await admin.from("posts").select("updated_at").eq("id", draftId).single();
    check("A title-only edit does NOT move updated_at (it is the content version)", titleOnly.data?.updated_at === before, `${before} -> ${titleOnly.data?.updated_at}`);
  } else {
    console.log("SKIP  trigger de caché (falta SUPABASE_SECRET_KEY)");
  }
} finally {
  // --- Limpieza: borrar lo propio es un permiso legítimo ---
  let removed = 0;
  for (const id of created.reverse()) {
    const res = await client.from("posts").delete().eq("id", id).select("id");
    removed += res.data?.length ?? 0;
  }
  check("CAN delete own rows (cleanup)", removed === created.length, `borradas ${removed} de ${created.length}`);
}

const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} checks OK`);
process.exit(failed ? 1 : 0);
