# PRD 11.3 - Aviso de nuevo artículo a seguidores

| Campo | Valor |
| :--- | :--- |
| Estado | **Por implementar** |
| Depende de | [PRD-11](PRD-11-emails-transaccionales.md) (setup compartido), [PRD-3.1](PRD-3.1-follow-system.md) (`subscriptions`), [PRD-5.3](PRD-5.3-publish-moderation.md) (`publishPost`) |
| Migraciones | `0012_email_preferences.sql` (nueva) |
| ADRs relacionados | [0028](../adr/0028-emails-transaccionales-resend.md), [0007](../adr/0007-login-por-username-con-secret-key.md) (precedente de `SECURITY DEFINER` sobre `auth.users`) |
| Código (a crear) | `supabase/migrations/0012_email_preferences.sql`, `src/features/subscriptions/queries.ts` (`getFollowerEmails`), `src/features/subscriptions/notify-followers.ts`, `src/lib/email/templates/new-article.ts`, `src/app/unsubscribe/[token]/route.ts`, cambio en `src/features/posts/actions.ts` (`publishPost`) |

## Problema y objetivo

**Problema.** Un lector que sigue a un autor solo se entera de un artículo nuevo si vuelve a abrir la app. No hay ningún empuje hacia afuera de la sesión web.

**Objetivo.** Avisar por correo a cada seguidor cuando el autor publica, con el artículo completo (en Markdown, renderizado a HTML) para poder leerlo directo desde el correo, y dar una forma de no recibir más este correo específico sin tener que dejar de seguir al autor.

## Alcance / fuera de alcance

| Dentro | Fuera |
| :--- | :--- |
| Correo con el artículo completo al publicarse (`status = published`) | Notificar por edición o borrado del artículo |
| Opt-out propio (`notify_new_article_email`), independiente de seguir/dejar de seguir | Preferencias granulares por autor (silenciar solo a uno) |
| Link de baja sin login, por token | Centro de preferencias de email con login |
| Envío síncrono best-effort, sin reintentos | Cola, reintentos, límite de tasa propio |
| Solo texto/formato del Markdown (negrita, listas, enlaces, código) | Imágenes embebidas en el correo |

## Migración `0012_email_preferences.sql`

```sql
alter table public.profiles
  add column if not exists notify_new_article_email boolean not null default true;

alter table public.profiles
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_unsubscribe_token_key
  on public.profiles (unsubscribe_token);

-- Mismo patrón que login_email_for_username (0004_username.sql).
create or replace function public.follower_emails_for_author (p_author_id uuid)
returns table (follower_id uuid, email text, unsubscribe_token uuid)
language sql stable security definer set search_path = ''
as $$
  select p.id, u.email::text, p.unsubscribe_token
  from public.subscriptions s
  join public.profiles p on p.id = s.follower_id
  join auth.users u on u.id = p.id
  where s.author_id = p_author_id
    and p.notify_new_article_email = true
$$;

revoke all on function public.follower_emails_for_author (uuid) from public, anon, authenticated;
grant execute on function public.follower_emails_for_author (uuid) to service_role;
```

Actualizar a mano: `src/lib/supabase/database.types.ts` (columnas + firma del RPC) y `docs/db/schema.md`.

El `unsubscribe_token` es un `uuid` sin firmar y sin expiración a propósito: solo puede apagar el boolean de esa fila, nunca leer ni cambiar la cuenta ([ADR 0028](../adr/0028-emails-transaccionales-resend.md)).

## Cómo va a funcionar

### Renderizado de Markdown a HTML de email

`react-markdown` (usado en `MarkdownContent.tsx`) es un componente React, no sirve para producir un string de HTML del lado servidor. Se usa `remark` (ya es dependencia, base de `react-markdown`) + `remark-gfm` + `remark-html` (nueva dependencia):

```ts
// src/lib/email/markdown.ts
export async function markdownToEmailHtml(markdown: string): Promise<string> {
  const file = await remark().use(remarkGfm).use(remarkHtml, { sanitize: true }).process(markdown);
  return String(file);
}
```

Sanitización propia porque acá se emite un string HTML crudo, a diferencia de `MarkdownContent.tsx`, que se apoya en el escapado de React. **Verificar antes de cerrar el PRD** que el `sanitize` de `remark-html` resiste Markdown adversarial (links `javascript:`, atributos de evento vía referencias); si no alcanza, sumar `sanitize-html` como capa extra.

### Consultas y plantilla

- `src/features/subscriptions/queries.ts`: `getFollowerEmails(authorId)` vía `createAdminClient().rpc("follower_emails_for_author", { p_author_id: authorId })`.
- `src/lib/email/templates/new-article.ts`: `newArticleEmail({ authorName, title, bodyHtml, postUrl, unsubscribeUrl }) => { subject, html }`, con el link de baja siempre presente en el footer.

### Ruta de baja

`src/app/unsubscribe/[token]/route.ts` (GET, sin login — pensado para un clic directo desde el cliente de correo):

```ts
await createAdminClient()
  .from("profiles")
  .update({ notify_new_article_email: false })
  .eq("unsubscribe_token", token);
// redirect a una página de confirmación simple
```

Es un `GET` que muta a propósito: mismo trade-off que cualquier unsubscribe de la industria, con impacto acotado a esa única preferencia.

### Fan-out

`src/features/subscriptions/notify-followers.ts` (vive en `subscriptions`, no en `posts`, para evitar el ciclo de imports posts→subscriptions→posts):

```ts
export async function notifyFollowersOfNewArticle({ authorId, postId }: { authorId: string; postId: string }) {
  const [post, followers, author] = await Promise.all([
    getPostForEmail(postId),      // title, content
    getFollowerEmails(authorId),
    getAuthorDisplayName(authorId),
  ]);
  const bodyHtml = await markdownToEmailHtml(post.content);
  const results = await Promise.allSettled(
    followers.map((f) =>
      sendEmail({
        to: f.email,
        ...newArticleEmail({
          authorName: author.displayName,
          title: post.title,
          bodyHtml,
          postUrl: `${env.NEXT_PUBLIC_SITE_URL}/post/${postId}`,
          unsubscribeUrl: `${env.NEXT_PUBLIC_SITE_URL}/unsubscribe/${f.unsubscribe_token}`,
        }),
      }),
    ),
  );
  // loguear los rejected de `results`, nunca relanzar
}
```

`Promise.allSettled`, no un loop con `await` que corte en el primer error: un envío roto no debe frenar al resto (mismo espíritu best-effort que `recordRead` en el codebase).

### Hook en `publishPost`

En `src/features/posts/actions.ts`, justo cuando `decision.status === "published"`. Se usa `after()` de `next/server` (Next 16, ya disponible) en vez de un `void` suelto: en un entorno serverless una promesa no esperada puede cortarse apenas se manda la respuesta; `after()` la deja terminar sin bloquear al autor que publica.

```ts
import { after } from "next/server";
// ...
if (decision.status === "published") {
  after(() =>
    notifyFollowersOfNewArticle({ authorId: user.id, postId: post.id }).catch((error) =>
      console.error("[new-article-email] fanout failed", error),
    ),
  );
}
```

## Criterios de aceptación

- [ ] Publicar un artículo dispara un correo a cada seguidor del autor con `notify_new_article_email = true`.
- [ ] Un seguidor con `notify_new_article_email = false` no recibe el correo (la función SQL ya lo filtra).
- [ ] El correo contiene el artículo completo, con el Markdown renderizado (negrita, listas, enlaces, bloques de código).
- [ ] El link de baja del correo, sin login, desactiva `notify_new_article_email` para ese usuario y muestra una confirmación.
- [ ] Un fallo de envío a un seguidor no impide que los demás reciban el correo (verificado con `Promise.allSettled` y un mock que falla para uno de varios destinatarios).
- [ ] `publishPost` responde sin esperar a que termine el fan-out (verificar que el tiempo de respuesta no crece con la cantidad de seguidores).
- [ ] El HTML renderizado de un Markdown con un intento de inyección (`[link](javascript:alert(1))`, HTML crudo embebido) no ejecuta nada al abrirse.

## Pruebas

- Unitarias: `markdownToEmailHtml` (GFM y casos de inyección), `newArticleEmail` (snapshot), `notifyFollowersOfNewArticle` (mock de `sendEmail`, un fallo entre varios no corta el resto).
- Manual: publicar un artículo desde una cuenta seguida por otra, confirmar la llegada del correo y que el link de baja funciona.
