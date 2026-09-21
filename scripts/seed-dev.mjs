// Datos de prueba para desarrollo: 4 usuarios con artículos publicados, notas (sueltas y
// respuestas a un artículo), tags, likes, lecturas (reading_history) y seguimientos.
// Uso: pnpm seed:dev   (requiere .env.local con las tres variables de Supabase y las migraciones 0005 a 0007 aplicadas)
//
// Las cuentas se crean con el Admin API (la secret key) porque el registro público de
// Supabase rechaza dominios sin MX. Los posts también se insertan con la secret key:
// tras la migración 0007 el cliente no puede escribir `status`/`published_at` de un
// artículo ni fijar `created_at`/`updated_at`. Lo demás (perfil, tags, likes, lecturas,
// seguimientos) se hace con cada usuario logueado, bajo RLS, igual que la app.
// Es idempotente: se puede correr más de una vez.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;

if (!url || !key || !secret) {
  throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY o SUPABASE_SECRET_KEY.");
}

const PASSWORD = "Seed-Password-123";
const DAY = 24 * 60 * 60 * 1000;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options);

const USERS = [
  {
    email: "lucia.seed@blog-ia.test", username: "lucia_dev", displayName: "Lucía Fernández",
    posts: [
      { title: "Por qué dejé de escribir comentarios en mi código", tags: ["arquitectura", "escritura"], ago: 0.2,
        content: "Durante años llené mis archivos de comentarios que explicaban qué hacía cada línea. Hoy los borro casi todos.\n\nUn buen nombre de función dice lo que hace. Un comentario debería decir por qué: la restricción escondida, el bug que obligó a esa solución, el caso raro que nadie esperaba.\n\nCuando un comentario describe el qué, se pudre en cuanto cambia el código. Cuando explica el por qué, sigue siendo verdad mucho después." },
      { title: "Server Actions en Next.js: lo que aprendí en producción", tags: ["nextjs", "typescript"], ago: 2,
        content: "Las Server Actions son cómodas, pero es fácil olvidarse de algo importante: cada una es un endpoint público. Nada de lo que recibe viene garantizado por TypeScript en tiempo de ejecución.\n\nMi regla: validar con Zod al principio de cada acción, sin excepciones, y no confiar en ningún id que llegue del cliente. Después, la autorización real la hace la base de datos con RLS, no la interfaz.\n\nOtra cosa que me sorprendió: redirect() lanza una excepción internamente, así que no lo envuelvas en un try/catch o vas a tragarte la navegación. Lo aprendí después de una tarde entera de debugging." },
      { title: "Una nota corta sobre RLS", tags: ["supabase"], ago: 5,
        content: "Si tu seguridad depende de que la interfaz oculte un botón, no tenés seguridad. Las políticas RLS son la barrera real." },
    ],
    notes: [
      { content: "Hoy borré 200 líneas de comentarios y el código quedó más claro. Nombres primero, comentarios solo para el por qué.", ago: 0.1 },
      { content: "Coincido: el problema no es el modelo, es no poder verificar la respuesta.", ago: 0.3, replyTo: "Qué NO delegaría nunca en un modelo de lenguaje" },
    ],
  },
  {
    email: "mateo.seed@blog-ia.test", username: "mateo_ia", displayName: "Mateo Ruiz",
    posts: [
      { title: "Cómo uso IA para destrabar la hoja en blanco", tags: ["ia", "escritura", "productividad"], ago: 0.5,
        content: "No le pido que escriba por mí. Le pido un esqueleto: tres o cuatro secciones con una frase cada una. Con eso ya tengo por dónde empezar.\n\nDespués cierro la herramienta y escribo yo. El borrador es mío, la estructura fue una sugerencia que acepté o descarté." },
      { title: "Prompts que sí funcionan para revisar un borrador", tags: ["ia", "escritura"], ago: 3,
        content: "Los prompts vagos dan respuestas vagas. Los que mejor me funcionan son específicos: 'marcame las tres oraciones más largas', 'qué párrafo podría cortar sin perder nada', 'qué le falta a este argumento para convencer a alguien escéptico'.\n\nPedir preguntas en vez de correcciones también ayuda: obliga a pensar en lo que el texto no está diciendo." },
      { title: "Qué NO delegaría nunca en un modelo de lenguaje", tags: ["ia", "arquitectura"], ago: 6,
        content: "Las decisiones de arquitectura. Un modelo puede listarte opciones y tradeoffs, pero no conoce tus restricciones reales: el equipo, el plazo, el presupuesto, lo que ya intentaste.\n\nTampoco le delegaría nada que no pueda verificar. Si no entendés la respuesta lo suficiente como para detectar cuando está mal, el problema no es el modelo." },
    ],
    notes: [
      { content: "Pedirle a un modelo que te haga preguntas sobre tu borrador funciona mejor que pedirle que lo corrija.", ago: 0.2 },
      { content: "La regla de validar con Zod en cada acción me salvó de un bug feo la semana pasada. Gracias por compartirla.", ago: 0.4, replyTo: "Server Actions en Next.js: lo que aprendí en producción" },
    ],
  },
  {
    email: "sofia.seed@blog-ia.test", username: "sofi_writes", displayName: "Sofía Álvarez",
    posts: [
      { title: "Diseñar para mobile primero cambia todo", tags: ["diseno", "productividad"], ago: 1,
        content: "Cuando empezás por la pantalla chica te ves obligado a decidir qué importa. No hay espacio para relleno.\n\nAgregar espacio para desktop después es fácil y casi mecánico. Hacer el camino inverso —achicar un diseño pensado para pantalla grande— casi siempre termina en parches." },
      { title: "El feed perfecto no existe (pero el cronológico se acerca)", tags: ["diseno", "arquitectura"], ago: 4,
        content: "Los algoritmos de recomendación prometen mostrarte lo que te interesa, pero también deciden por vos. Un feed cronológico es aburrido y predecible, y eso lo hace confiable: sabés que no te estás perdiendo nada por una decisión oculta.\n\nLo ideal, creo, es combinar ambos: orden cronológico por defecto y una sección aparte, claramente marcada, con sugerencias." },
    ],
    notes: [
      { content: "Probé el feed en un celular de pantalla chica y descubrí tres cosas que sobraban. Mobile primero, siempre.", ago: 0.6 },
    ],
  },
  {
    email: "nicolas.seed@blog-ia.test", username: "nico_tech", displayName: "Nicolás Vega",
    posts: [
      { title: "Supabase vs. montar tu propio backend: mi decisión", tags: ["supabase", "arquitectura"], ago: 1.5,
        content: "Para un proyecto chico o un MVP, Supabase me ahorra semanas: autenticación, base de datos y permisos ya resueltos.\n\nEl costo es acoplarte a su modelo, sobre todo a RLS. Si mañana migrás, las políticas hay que reescribirlas. Para mí ese riesgo vale la pena hasta que el producto demuestre que necesita otra cosa." },
      { title: "Tipos generados desde la base: los mejores cinco minutos del proyecto", tags: ["supabase", "typescript"], ago: 3.5,
        content: "Sin tipos, cada consulta devuelve any y un typo en una columna aparece en producción. Con tipos, el compilador te avisa antes de guardar el archivo." },
      { title: "Tres tests que salvaron mi fin de semana", tags: ["typescript", "productividad"], ago: 7,
        content: "Un test de los schemas de validación, uno de la lógica de estados y uno que intenta hacer lo que un usuario no debería poder hacer.\n\nEl tercero es el que más me sirvió: cada vez que rompí una regla de seguridad sin querer, falló ese." },
    ],
    notes: [
      { content: "El tercer test de mi lista de hoy: intentar leer el borrador de otro usuario. Si pasa, algo está muy mal.", ago: 0.15 },
      { content: "Totalmente de acuerdo con lo del feed cronológico. Predecible es una virtud.", ago: 0.5, replyTo: "El feed perfecto no existe (pero el cronológico se acerca)" },
    ],
  },
];

// [quien da el like, artículo (por título) o nota (por contenido)]
const LIKES = [
  ["mateo_ia", "Por qué dejé de escribir comentarios en mi código"],
  ["nico_tech", "Por qué dejé de escribir comentarios en mi código"],
  ["sofi_writes", "Por qué dejé de escribir comentarios en mi código"],
  ["lucia_dev", "Cómo uso IA para destrabar la hoja en blanco"],
  ["nico_tech", "Diseñar para mobile primero cambia todo"],
  ["lucia_dev", "Pedirle a un modelo que te haga preguntas sobre tu borrador funciona mejor que pedirle que lo corrija."],
  ["sofi_writes", "Pedirle a un modelo que te haga preguntas sobre tu borrador funciona mejor que pedirle que lo corrija."],
  ["mateo_ia", "Hoy borré 200 líneas de comentarios y el código quedó más claro. Nombres primero, comentarios solo para el por qué."],
];

// [quien lee, artículo (por título)]. sofi_writes queda sin historial a propósito
// para probar el fallback de recomendados.
const READS = [
  ["mateo_ia", "Por qué dejé de escribir comentarios en mi código"],
  ["mateo_ia", "Una nota corta sobre RLS"],
  ["nico_tech", "Server Actions en Next.js: lo que aprendí en producción"],
];

const FOLLOWS = [
  ["mateo_ia", "lucia_dev"], ["mateo_ia", "sofi_writes"], ["nico_tech", "lucia_dev"],
  ["lucia_dev", "mateo_ia"], ["sofi_writes", "nico_tech"],
];

async function authed(user) {
  const client = createClient(url, key, options);
  let { data, error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD });
  if (error) {
    const created = await admin.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true });
    if (created.error) throw new Error(`createUser ${user.username}: ${created.error.message}`);
    console.log(`  cuenta creada: ${user.username}`);
    ({ data, error } = await client.auth.signInWithPassword({ email: user.email, password: PASSWORD }));
    if (error) throw new Error(`signIn ${user.username}: ${error.message}`);
  }
  return { client, id: data.user.id };
}

// DO NOTHING en conflicto: `tags` no tiene política de UPDATE.
async function tagId(client, name) {
  await client.from("tags").upsert({ name }, { onConflict: "name", ignoreDuplicates: true });
  const { data, error } = await client.from("tags").select("id").eq("name", name).maybeSingle();
  if (error || !data) throw new Error(`tag ${name}: ${error?.message ?? "no encontrado"}`);
  return data.id;
}

const ids = {};
const clients = {};
const articleIds = new Map();
const noteIds = new Map();

for (const user of USERS) {
  console.log(`> ${user.username}`);
  const { client, id } = await authed(user);
  ids[user.username] = id;
  clients[user.username] = client;

  const profile = await client.from("profiles").upsert({
    id, display_name: user.displayName, username: user.username, onboarded_at: new Date().toISOString(),
  });
  if (profile.error) throw new Error(`profile ${user.username}: ${profile.error.message}`);

  const existing = await client.from("posts").select("id, title").eq("author_id", id).eq("type", "article");
  const byTitle = new Map((existing.data ?? []).map((post) => [post.title, post.id]));

  for (const post of user.posts) {
    let postId = byTitle.get(post.title);
    if (!postId) {
      const publishedAt = new Date(Date.now() - post.ago * DAY).toISOString();
      const inserted = await admin.from("posts").insert({
        author_id: id, type: "article", title: post.title, content: post.content,
        status: "published", published_at: publishedAt, created_at: publishedAt, updated_at: publishedAt,
      }).select("id").single();
      if (inserted.error) throw new Error(`post "${post.title}": ${inserted.error.message}`);
      postId = inserted.data.id;
    }

    for (const name of post.tags) {
      const link = await client.from("post_tags").upsert(
        { post_id: postId, tag_id: await tagId(client, name) },
        { onConflict: "post_id,tag_id", ignoreDuplicates: true },
      );
      if (link.error) throw new Error(`post_tag ${name}: ${link.error.message}`);
    }
    articleIds.set(post.title, postId);
    console.log(`  ${byTitle.has(post.title) ? "ok " : "new"} "${post.title}" [${post.tags.join(", ")}]`);
  }
}

console.log("> notas");
for (const user of USERS) {
  const client = clients[user.username];
  const existing = await client.from("posts").select("id, content").eq("author_id", ids[user.username]).eq("type", "note");
  const byContent = new Map((existing.data ?? []).map((note) => [note.content, note.id]));

  for (const note of user.notes) {
    let noteId = byContent.get(note.content);
    if (!noteId) {
      const parentId = note.replyTo ? articleIds.get(note.replyTo) : null;
      if (note.replyTo && !parentId) throw new Error(`nota "${note.content}": no existe el artículo "${note.replyTo}"`);
      const publishedAt = new Date(Date.now() - note.ago * DAY).toISOString();
      const inserted = await admin.from("posts").insert({
        author_id: ids[user.username], type: "note", content: note.content, parent_post_id: parentId,
        status: "published", published_at: publishedAt, created_at: publishedAt, updated_at: publishedAt,
      }).select("id").single();
      if (inserted.error) throw new Error(`nota "${note.content}": ${inserted.error.message}`);
      noteId = inserted.data.id;
    }
    noteIds.set(note.content, noteId);
    console.log(`  ${byContent.has(note.content) ? "ok " : "new"} ${user.username}: "${note.content.slice(0, 50)}"${note.replyTo ? " (respuesta)" : ""}`);
  }
}

console.log("> likes");
for (const [liker, target] of LIKES) {
  const postId = articleIds.get(target) ?? noteIds.get(target);
  if (!postId) throw new Error(`like ${liker}: no existe "${target}"`);
  const res = await clients[liker].from("likes").upsert(
    { user_id: ids[liker], post_id: postId },
    { onConflict: "user_id,post_id", ignoreDuplicates: true },
  );
  if (res.error) throw new Error(`like ${liker}: ${res.error.message}`);
  console.log(`  ${liker} -> "${target.slice(0, 50)}"`);
}

console.log("> lecturas");
for (const [reader, target] of READS) {
  const postId = articleIds.get(target);
  if (!postId) throw new Error(`lectura ${reader}: no existe el artículo "${target}"`);
  const res = await clients[reader].from("reading_history").upsert(
    { user_id: ids[reader], post_id: postId },
    { onConflict: "user_id,post_id", ignoreDuplicates: true },
  );
  if (res.error) throw new Error(`lectura ${reader}: ${res.error.message}`);
  console.log(`  ${reader} leyó "${target.slice(0, 50)}"`);
}

console.log("> seguimientos");
for (const [follower, author] of FOLLOWS) {
  const res = await clients[follower].from("subscriptions").upsert(
    { follower_id: ids[follower], author_id: ids[author] },
    { onConflict: "follower_id,author_id", ignoreDuplicates: true },
  );
  if (res.error) throw new Error(`follow ${follower}->${author}: ${res.error.message}`);
  console.log(`  ${follower} -> ${author}`);
}

console.log(`\nListo. Contraseña de las cuentas de prueba: ${PASSWORD}`);
console.log("Usuarios: " + USERS.map((user) => user.username).join(", "));
