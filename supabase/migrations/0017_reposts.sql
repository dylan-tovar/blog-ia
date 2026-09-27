-- PRD 7.3: Reposts (re-publicación de artículos y notas)
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).
-- Es re-ejecutable y sigue el mismo patrón de `likes` (migración 0005) y `subscriptions` (0003).

-- 1. Tabla `reposts`
create table if not exists public.reposts (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now (),
  unique (user_id, post_id)
);

-- Índices para búsquedas eficientes en feed y perfiles
create index if not exists reposts_user_id_idx on public.reposts (user_id);
create index if not exists reposts_post_id_idx on public.reposts (post_id);
create index if not exists reposts_created_at_idx on public.reposts (created_at desc);

-- 2. RLS habilitado
alter table public.reposts enable row level security;

-- Lectura pública: cualquiera puede ver los reposts
drop policy if exists "Reposts are viewable by everyone" on public.reposts;
create policy "Reposts are viewable by everyone"
  on public.reposts for select
  using (true);

-- Insertar reposts: solo usuarios autenticados como ellos mismos y sobre posts publicados
drop policy if exists "Users can repost published posts as themselves" on public.reposts;
create policy "Users can repost published posts as themselves"
  on public.reposts for insert
  with check (
    user_id = auth.uid ()
    and exists (
      select 1 from public.posts
      where posts.id = reposts.post_id
        and posts.status = 'published'
    )
  );

-- Eliminar reposts: solo el propio usuario puede quitar su repost
drop policy if exists "Users can remove their own reposts" on public.reposts;
create policy "Users can remove their own reposts"
  on public.reposts for delete
  using (user_id = auth.uid ());
