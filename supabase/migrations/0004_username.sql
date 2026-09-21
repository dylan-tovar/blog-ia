-- Username en `profiles` + búsqueda username -> email para iniciar sesión.
-- Correr en el SQL Editor de Supabase (Dashboard > SQL Editor).

alter table public.profiles add column if not exists username text;

-- Perfiles existentes: usuario provisorio derivado del id (editable en /settings).
update public.profiles
set username = 'user_' || substr(replace(id::text, '-', ''), 1, 8)
where username is null;

alter table public.profiles alter column username set not null;

alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9_]{3,20}$');

create unique index if not exists profiles_username_key
  on public.profiles (username);

-- Devuelve el email de un username. SOLO la app en el servidor (con la secret
-- key, rol service_role) puede ejecutarla: `profiles` es pública, así que si
-- anon/authenticated pudieran llamarla se filtrarían los emails.
create or replace function public.login_email_for_username (p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(p_username)
  limit 1
$$;

revoke all on function public.login_email_for_username (text) from public, anon, authenticated;
grant execute on function public.login_email_for_username (text) to service_role;
