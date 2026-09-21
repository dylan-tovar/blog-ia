-- PRD 7: tipos de post (nota / artículo), notas adjuntas a otro post y tabla `likes`.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).
-- Es re-ejecutable: la conversión de datos existentes corre solo la primera vez
-- (cuando todavía no existe la columna `posts.type`).

-- 1. Columnas nuevas + conversión de los posts de prueba existentes a notas
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'posts' and column_name = 'type'
  ) then
    alter table public.posts add column type text not null default 'article';

    -- Una nota necesita texto: si el contenido está vacío se usa el título como texto.
    update public.posts
    set content = coalesce (title, '')
    where btrim (content) = '';

    -- Borradores fantasma sin título ni contenido: no hay nada que conservar.
    delete from public.posts where btrim (content) = '';

    update public.posts
    set type = 'note',
        title = null,
        status = 'published',
        published_at = coalesce (published_at, created_at);

    -- Las notas no llevan tags.
    delete from public.post_tags
    where post_id in (select id from public.posts where type = 'note');
  end if;
end $$;

alter table public.posts
  add column if not exists parent_post_id uuid
    references public.posts (id) on delete set null;

-- 2. Invariantes del modelo (se validan en la base, no solo en las Server Actions)
alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts
  add constraint posts_type_check check (type in ('note', 'article'));

alter table public.posts drop constraint if exists posts_note_shape_check;
alter table public.posts
  add constraint posts_note_shape_check check (
    type <> 'note'
    or (status = 'published' and published_at is not null and title is null)
  );

-- NOT VALID: las notas convertidas pueden superar los 500 caracteres; el límite
-- aplica a toda nota nueva.
alter table public.posts drop constraint if exists posts_note_length_check;
alter table public.posts
  add constraint posts_note_length_check check (
    type <> 'note' or char_length (content) between 1 and 500
  ) not valid;

alter table public.posts drop constraint if exists posts_article_no_parent_check;
alter table public.posts
  add constraint posts_article_no_parent_check check (
    type = 'note' or parent_post_id is null
  );

create index if not exists posts_parent_post_id_idx
  on public.posts (parent_post_id)
  where parent_post_id is not null;

-- 3. Políticas de `posts`
-- Una nota solo puede colgar de un post publicado que no sea a su vez una
-- respuesta (sin hilos anidados). Va en una función security definer porque una
-- política de `posts` que consulta `posts` falla con 42P17 (recursión de RLS).
create or replace function public.can_attach_note (p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts parent
    where parent.id = p_parent_id
      and parent.status = 'published'
      and parent.parent_post_id is null
  );
$$;

revoke execute on function public.can_attach_note (uuid) from public, anon;
grant execute on function public.can_attach_note (uuid) to authenticated;

drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts"
  on public.posts for insert
  with check (
    author_id = auth.uid ()
    and (
      parent_post_id is null
      or public.can_attach_note (parent_post_id)
    )
  );

-- UPDATE: solo artículos; las notas son inmutables y el tipo no puede cambiar.
drop policy if exists "Users can update their own posts" on public.posts;
create policy "Users can update their own posts"
  on public.posts for update
  using (author_id = auth.uid () and type = 'article')
  with check (author_id = auth.uid () and type = 'article');

-- post_tags: solo los artículos llevan tags.
drop policy if exists "Users can tag their own posts" on public.post_tags;
create policy "Users can tag their own posts"
  on public.post_tags for insert
  with check (
    exists (
      select 1 from public.posts
      where posts.id = post_tags.post_id
        and posts.author_id = auth.uid ()
        and posts.type = 'article'
    )
  );

-- 4. likes
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create index if not exists likes_post_id_idx on public.likes (post_id);

alter table public.likes enable row level security;

drop policy if exists "Likes are viewable by everyone" on public.likes;
create policy "Likes are viewable by everyone"
  on public.likes for select
  using (true);

-- Solo sobre posts publicados: la FK ignora RLS y permitiría likear borradores.
drop policy if exists "Users can like published posts as themselves" on public.likes;
create policy "Users can like published posts as themselves"
  on public.likes for insert
  with check (
    user_id = auth.uid ()
    and exists (
      select 1 from public.posts
      where posts.id = likes.post_id
        and posts.status = 'published'
    )
  );

drop policy if exists "Users can remove their own likes" on public.likes;
create policy "Users can remove their own likes"
  on public.likes for delete
  using (user_id = auth.uid ());
