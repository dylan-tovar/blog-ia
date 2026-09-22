-- Permite responder a una respuesta manteniendo el modelo de hilo plano:
-- `parent_post_id` sigue apuntando siempre a la raíz publicada (invariante sin
-- cambios, ver 0005). `reply_to_post_id` es puramente de visualización: guarda
-- a qué nota concreta le está respondiendo esta nota, para mostrar
-- "En respuesta a X" con el autor inmediato en vez de siempre la raíz.

alter table public.posts
  add column if not exists reply_to_post_id uuid
    references public.posts (id) on delete set null;

alter table public.posts drop constraint if exists posts_article_no_reply_to_check;
alter table public.posts
  add constraint posts_article_no_reply_to_check check (
    type = 'note' or reply_to_post_id is null
  );

alter table public.posts drop constraint if exists posts_reply_to_not_self_check;
alter table public.posts
  add constraint posts_reply_to_not_self_check check (
    reply_to_post_id is null or reply_to_post_id <> id
  );

create index if not exists posts_reply_to_post_id_idx
  on public.posts (reply_to_post_id)
  where reply_to_post_id is not null;

-- `0007` limita el INSERT a una lista fija de columnas (privilegios por columna,
-- ADR 0012); sin este grant, `createNote` fallaría al intentar escribir
-- `reply_to_post_id` aunque la política de abajo lo permitiera.
grant insert (reply_to_post_id) on public.posts to authenticated;

-- Una respuesta a una nota debe apuntar a otra nota publicada del MISMO hilo
-- (mismo `parent_post_id`), nunca a una nota de otra raíz. Security definer por
-- el mismo motivo que `can_attach_note`: una política de `posts` que consulta
-- `posts` directamente falla con 42P17 (recursión de RLS).
create or replace function public.can_reply_to_note (p_reply_to_id uuid, p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts target
    where target.id = p_reply_to_id
      and target.status = 'published'
      and target.type = 'note'
      and target.parent_post_id = p_parent_id
  );
$$;

revoke execute on function public.can_reply_to_note (uuid, uuid) from public, anon;
grant execute on function public.can_reply_to_note (uuid, uuid) to authenticated;

-- Recrea la política de `0007` (autor propio, un artículo solo nace como
-- borrador, padre válido) sumando la condición nueva de `reply_to_post_id`.
drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts"
  on public.posts for insert
  with check (
    author_id = auth.uid ()
    and (type = 'note' or status = 'draft')
    and (
      parent_post_id is null
      or public.can_attach_note (parent_post_id)
    )
    and (
      reply_to_post_id is null
      or public.can_reply_to_note (reply_to_post_id, parent_post_id)
    )
  );
