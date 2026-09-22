-- Preferencia de email de "nuevo artículo" + función para leer los emails de
-- los seguidores de un autor sin exponer auth.users.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).

alter table public.profiles
  add column if not exists notify_new_article_email boolean not null default true;

alter table public.profiles
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_unsubscribe_token_key
  on public.profiles (unsubscribe_token);

-- Devuelve el email y el token de baja de cada seguidor de un autor que no se
-- dio de baja de este correo. Mismo patrón que login_email_for_username
-- (0004_username.sql): SOLO la app en el servidor (rol service_role) puede
-- ejecutarla, porque cruza con auth.users.
create or replace function public.follower_emails_for_author (p_author_id uuid)
returns table (follower_id uuid, email text, unsubscribe_token uuid)
language sql
stable
security definer
set search_path = ''
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
