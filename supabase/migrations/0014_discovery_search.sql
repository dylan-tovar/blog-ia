-- Descubrimiento: índices para búsqueda ILIKE (personas/publicaciones/temas) y
-- función `popular_authors` para el pool de sugeridos para seguir.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).
-- Es re-ejecutable: `create index if not exists` y `create or replace function`.

-- 1. Índices btree sobre `lower(...)` para que el ILIKE de la búsqueda (v1, sin
-- pg_trgm/tsvector, ver ADR 0030) pueda usar índice en vez de un scan completo.
create index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

create index if not exists profiles_display_name_lower_idx
  on public.profiles (lower(display_name));

create index if not exists posts_title_lower_idx
  on public.posts (lower(title))
  where status = 'published' and type = 'article';

create index if not exists tags_name_lower_idx
  on public.tags (lower(name));

-- 2. Pool de autores más seguidos, excluyendo al viewer y a quien ya sigue.
-- Mismo patrón que `popular_tags` (0010): `security invoker` (las políticas de
-- `profiles`/`subscriptions`, ya públicas, siguen aplicando), solo `authenticated`.
-- El join con `subscriptions` es a propósito inner: un autor sin seguidores no
-- entra al pool de "más seguidos" (orden de popularidad puro).
create or replace function public.popular_authors (p_exclude uuid[] default '{}', p_limit int default 50)
returns table (id uuid, follower_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, count (s.id) as follower_count
  from public.profiles p
  join public.subscriptions s on s.author_id = p.id
  where not (p.id = any (p_exclude))
  group by p.id
  order by count (s.id) desc, p.id asc
  limit greatest (p_limit, 0)
$$;

revoke execute on function public.popular_authors (uuid[], int) from public, anon;
grant execute on function public.popular_authors (uuid[], int) to authenticated;
