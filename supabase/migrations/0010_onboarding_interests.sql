-- Onboarding en dos pasos: `profiles.onboarded_at`, tabla `user_interests` y función `popular_tags`.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).
-- Es re-ejecutable: el backfill de `onboarded_at` corre solo la primera vez (cuando todavía
-- no existe la columna), así que volver a correr el archivo no marca como terminado a
-- nadie que esté a mitad del onboarding.

-- 1. `profiles.onboarded_at`: null = el paso 2 (intereses) sigue pendiente.
-- Todos los perfiles que ya existen (incluidos los usuarios de prueba) cuentan como
-- terminados: no se los manda a elegir intereses.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'onboarded_at'
  ) then
    alter table public.profiles add column onboarded_at timestamptz;

    update public.profiles set onboarded_at = created_at;
  end if;
end $$;

-- 2. `user_interests`: tags que cada usuario eligió en el onboarding. Son privados
-- (solo el propio usuario los lee) y alimentan el perfil de las recomendaciones.
create table if not exists public.user_interests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);

create index if not exists user_interests_tag_id_idx on public.user_interests (tag_id);

alter table public.user_interests enable row level security;

drop policy if exists "Users can view their own interests" on public.user_interests;
create policy "Users can view their own interests"
  on public.user_interests for select
  using (user_id = (select auth.uid ()));

drop policy if exists "Users can add their own interests" on public.user_interests;
create policy "Users can add their own interests"
  on public.user_interests for insert
  with check (user_id = (select auth.uid ()));

drop policy if exists "Users can remove their own interests" on public.user_interests;
create policy "Users can remove their own interests"
  on public.user_interests for delete
  using (user_id = (select auth.uid ()));

-- Sin política de UPDATE a propósito: la fila es solo (usuario, tag); cambiar una
-- elección es borrar e insertar.

-- 3. Tags que ofrece el onboarding: solo los que están en artículos publicados, ordenados
-- por uso. `security invoker`: corre con los permisos de quien llama, así que las
-- políticas de `posts` y `post_tags` (publicados o propios) siguen aplicando.
create or replace function public.popular_tags (p_limit int default 30)
returns table (id uuid, name text, uses bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.name, count (*) as uses
  from public.tags t
  join public.post_tags pt on pt.tag_id = t.id
  join public.posts p on p.id = pt.post_id
  where p.status = 'published'
    and p.type = 'article'
  group by t.id, t.name
  order by count (*) desc, t.name asc
  limit greatest (p_limit, 0)
$$;

revoke execute on function public.popular_tags (int) from public, anon;
grant execute on function public.popular_tags (int) to authenticated;
